#!/usr/bin/env bash
set -euo pipefail

TSD_BIN="$(command -v tailscaled)"; TS_BIN="$(command -v tailscale)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"   # <- volume-backed

# 1) start tailscaled with persistent state
"${TSD_BIN}" \
  --state="${STATE_PATH}" \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --outbound-http-proxy-listen=localhost:1056 &
sleep 0.7

# 2) bring node up (only authenticate if first boot)
if [ ! -s "${STATE_PATH}" ]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up \
    --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${TS_HOSTNAME:-newtravelmind}" \
    --accept-routes=true \
    --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  # No authkey needed; just ensure settings are applied
  "${TS_BIN}" up \
    --hostname="${TS_HOSTNAME:-newtravelmind}" \
    --accept-routes=true \
    --accept-dns=false
fi

echo "TS IPv4: $(${TS_BIN} ip -4 || true)"

DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"
DB_PORT_CLEAN="${DB_PORT:-3306}"

echo "Pinging DB host over tailnet..."
${TS_BIN} ping -c 3 "${DB_HOST_CLEAN}" || true

echo "TCP probe to ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}..."
for i in {1..8}; do
  (echo >"/dev/tcp/${DB_HOST_CLEAN}/${DB_PORT_CLEAN}") >/dev/null 2>&1 && {
    echo "DB reachable."; break
  }
  echo "Waiting for DB... ($i/8)"
  sleep 2
done

# finally start your app
exec node server.js   # or npm start