#!/usr/bin/env bash
set -euo pipefail

TS_BIN="$(command -v tailscale)"
TSD_BIN="$(command -v tailscaled)"
NCAT_BIN="$(command -v ncat || true)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"

SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

# Sanity: show paths
echo "tailscaled: ${TSD_BIN} | tailscale: ${TS_BIN} | ncat: ${NCAT_BIN}"

# --- start tailscaled with persistent state ---
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &
sleep 0.8

# --- join tailnet (only auth on first boot) ---
if [ ! -s "${STATE_PATH}" ]; then
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

echo "TS IPv4: $(${TS_BIN} ip -4 || true)"

# --- wait for SOCKS to be listening ---
for i in {1..15}; do
  if ${NCAT_BIN} -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
    echo "SOCKS ready on ${SOCKS_HOST}:${SOCKS_PORT}"
    break
  fi
  echo "Waiting for SOCKS ${SOCKS_HOST}:${SOCKS_PORT}... ($i/15)"
  sleep 0.5
done

# --- start the local TCP forward -> DB over SOCKS5 ---
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"  # VPS TS IP (e.g., 100.66.175.61)
DB_PORT_CLEAN="${DB_PORT:-3306}"

# kill a stale listener if present
pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true

# IMPORTANT: use -l -k -p and -s 127.0.0.1 for best compatibility
# Each incoming local connection is proxied via SOCKS5 to 100.x:3306
${NCAT_BIN} -l -k -p "${LOCAL_FWD_PORT}" -s 127.0.0.1 \
  --sh-exec "${NCAT_BIN} --proxy ${SOCKS_HOST}:${SOCKS_PORT} --proxy-type socks5 ${DB_HOST_CLEAN} ${DB_PORT_CLEAN}" \
  >/tmp/ncat-forward.log 2>&1 &
sleep 0.5
echo "Forwarder listening: 127.0.0.1:${LOCAL_FWD_PORT} -> (SOCKS5 ${SOCKS_HOST}:${SOCKS_PORT}) -> ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}"

# --- prove the local listener is up before starting Node ---
for i in {1..10}; do
  if ${NCAT_BIN} -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward is accepting connections."
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/10)"
  sleep 0.6
done

# Optional: dump listener info for debugging the ECONNREFUSED case
# (uncomment if needed)
# apt-get update && apt-get install -y --no-install-recommends iproute2
# ss -lntp || true
# tail -n +1 /tmp/ncat-forward.log || true

# --- point the app at the local forward ---
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

ps aux | grep -E 'tailscaled|ncat' | grep -v grep || true
tail -n +1 /tmp/ncat-forward.log || true

# --- start your app ---
exec node server.js   # or npm start