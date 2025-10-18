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

# --- after 'SOCKS ready' ---

DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"  # VPS’s TS IP (e.g. 100.66.175.61)
DB_PORT_CLEAN="${DB_PORT:-3306}"
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
NCAT_BIN="$(command -v ncat)"

# kill any stale listener (if redeploying)
pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true

# START LISTENER: 127.0.0.1:13306 -> (SOCKS5 127.0.0.1:1055) -> 100.x:3306
# -l (listen), -k (keep-open), -p (port), -s (bind 127.0.0.1)
# When a client connects, ncat will connect to DB_HOST:DB_PORT *via* SOCKS5.
"${NCAT_BIN}" -l -k -p "${LOCAL_FWD_PORT}" -s 127.0.0.1 \
  --proxy "${SOCKS_HOST}:${SOCKS_PORT}" --proxy-type socks5 \
  "${DB_HOST_CLEAN}" "${DB_PORT_CLEAN}" \
  >/tmp/ncat-forward.log 2>&1 &

# Prove the listener is actually up before starting Node
for i in {1..30}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/30)"
  sleep 0.5
done

# (Optional) helpful debug if it ever fails again:
ps aux | grep -E 'tailscaled|ncat' | grep -v grep || true
ss -lntp || true
tail -n +1 /tmp/ncat-forward.log || true

# Point the app at the local forward
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

exec node server.js   # or npm start