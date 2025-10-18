#!/usr/bin/env bash
set -euo pipefail

TS_BIN="$(command -v tailscale || true)"
TSD_BIN="$(command -v tailscaled || true)"
NCAT_BIN="$(command -v ncat || true)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"

SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

echo "tailscaled: ${TSD_BIN} | tailscale: ${TS_BIN} | ncat: ${NCAT_BIN}"
if [[ -z "${TSD_BIN}" || -z "${TS_BIN}" ]]; then
  echo "ERROR: tailscale binaries not found" >&2; exit 1
fi
if [[ -z "${NCAT_BIN}" ]]; then
  echo "ERROR: ncat not found. Did you install 'nmap' in the final image stage?" >&2; exit 1
fi

# 1) Start tailscaled with persistent state
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &

# small settle
sleep 0.8

# 2) Join tailnet (auth only on first boot)
if [ ! -s "${STATE_PATH}" ]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

echo "TS IPv4: $(${TS_BIN} ip -4 || true)"

# 3) Wait for SOCKS to listen
for i in {1..30}; do
  if "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
    echo "SOCKS ready on ${SOCKS_HOST}:${SOCKS_PORT}"
    break
  fi
  echo "Waiting for SOCKS ${SOCKS_HOST}:${SOCKS_PORT}... ($i/30)"
  sleep 0.5
done

# 4) Start local forward 127.0.0.1:13306 -> (SOCKS5) -> 100.x:3306
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"   # your VPS TS IP (e.g., 100.66.175.61)
DB_PORT_CLEAN="${DB_PORT:-3306}"

# kill stale listeners on redeploy
pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true

# -l (listen), -k (keep-open), -p (port), -s (bind src addr 127.0.0.1)
${NCAT_BIN} -l -k -p "${LOCAL_FWD_PORT}" -s 127.0.0.1 \
  --sh-exec "${NCAT_BIN} --proxy ${SOCKS_HOST}:${SOCKS_PORT} --proxy-type socks5 ${DB_HOST_CLEAN} ${DB_PORT_CLEAN}" \
  >/tmp/ncat-forward.log 2>&1 &

# prove local listener is up before starting Node
for i in {1..20}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/20)"
  sleep 0.5
done

# Optional: connectivity checks
${TS_BIN} ping -c 2 "${DB_HOST_CLEAN}" || true
tail -n +1 /tmp/ncat-forward.log || true

# 5) Point app at the local forward
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

exec node server.js   # or npm start