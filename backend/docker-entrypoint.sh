#!/usr/bin/env bash
set -euo pipefail

TS_BIN="$(command -v tailscale)"
TSD_BIN="$(command -v tailscaled)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"     # /data is a Railway Volume
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"
SOCKS_ADDR="127.0.0.1:1055"

# --- 1) start tailscaled with persistent state ---
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_ADDR}" --outbound-http-proxy-listen=localhost:1056 &
sleep 0.7

# --- 2) join tailnet (only use TS_AUTHKEY on first boot) ---
if [ ! -s "${STATE_PATH}" ]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

echo "Tailscale IPv4: $(${TS_BIN} ip -4 || true)"

# --- 3) Set up a local TCP forward -> DB over the Tailscale SOCKS proxy ---
# DB_HOST should be the VPS's Tailscale IP (e.g., 100.66.175.61); DB_PORT usually 3306
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"
DB_PORT_CLEAN="${DB_PORT:-3306}"
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

# Kill any old forwarders if they exist (redeploys)
pkill -f "socat TCP-LISTEN:${LOCAL_FWD_PORT}," 2>/dev/null || true

# Example: listen on 127.0.0.1:13306 and forward via SOCKS5 -> 100.66.175.61:3306
socat TCP-LISTEN:${LOCAL_FWD_PORT},fork,reuseaddr \
  SOCKS5:${SOCKS_ADDR%:*}:${DB_HOST_CLEAN}:${DB_PORT_CLEAN},socksport=${SOCKS_ADDR#*:} &

echo "Forwarder: 127.0.0.1:${LOCAL_FWD_PORT} -> (SOCKS) -> ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}"

# Optional probes (comment out once stable)
for i in {1..8}; do
  echo "TCP probe to local forward 127.0.0.1:${LOCAL_FWD_PORT} (attempt $i)..."
  (echo >"/dev/tcp/127.0.0.1/${LOCAL_FWD_PORT}") >/dev/null 2>&1 && { echo "OK"; break; }
  sleep 2
done
${TS_BIN} ping -c 3 "${DB_HOST_CLEAN}" || true

# --- 4) Point the app at the local forward, not the 100.x directly ---
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

# --- 5) start your app ---
exec node server.js   # or: exec npm start