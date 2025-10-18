#!/usr/bin/env bash
set -euo pipefail

TS_BIN="$(command -v tailscale)"
TSD_BIN="$(command -v tailscaled)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"   # backed by a Railway Volume
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

# 1) Start tailscaled with persistent state
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &
sleep 0.7

# 2) Join tailnet (authenticate only on first boot)
if [ ! -s "${STATE_PATH}" ]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

echo "Tailscale IPv4: $(${TS_BIN} ip -4 || true)"

# 3) Local TCP forward → DB over SOCKS5
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"  # <-- VPS TS IP e.g. 100.66.175.61
DB_PORT_CLEAN="${DB_PORT:-3306}"

# kill any previous listeners on redeploy
pkill -f "ncat -l 127.0.0.1 ${LOCAL_FWD_PORT}" 2>/dev/null || true

# listen on 127.0.0.1:13306 and forward via socks5 to 100.66.175.61:3306
# --keep-open keeps the listener up for multiple connections
ncat -l 127.0.0.1 ${LOCAL_FWD_PORT} --keep-open \
  --sh-exec "ncat --proxy ${SOCKS_HOST}:${SOCKS_PORT} --proxy-type socks5 ${DB_HOST_CLEAN} ${DB_PORT_CLEAN}" &
sleep 0.5
echo "Forwarder: 127.0.0.1:${LOCAL_FWD_PORT} -> (SOCKS5 ${SOCKS_HOST}:${SOCKS_PORT}) -> ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}"

# Optional probes (remove after first success)
for i in {1..8}; do
  echo "TCP probe to local forward 127.0.0.1:${LOCAL_FWD_PORT} (attempt $i)..."
  (echo >"/dev/tcp/127.0.0.1/${LOCAL_FWD_PORT}") >/dev/null 2>&1 && { echo "OK"; break; }
  sleep 2
done
${TS_BIN} ping -c 3 "${DB_HOST_CLEAN}" || true

# 4) Point the app at the local forward, not the 100.x directly
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

# 5) Start your app
exec node server.js   # or: exec npm start