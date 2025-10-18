#!/usr/bin/env bash
set -euo pipefail

# Resolve binaries regardless of how you installed (apt vs static tgz)
TSD_BIN="$(command -v tailscaled || true)"
TS_BIN="$(command -v tailscale || true)"

if [[ -z "${TSD_BIN}" || -z "${TS_BIN}" ]]; then
  echo "ERROR: tailscale binaries not found on PATH."
  echo "Paths: tailscaled='${TSD_BIN:-<none>}', tailscale='${TS_BIN:-<none>}'"
  ls -l /usr/local/bin || true
  ls -l /usr/sbin || true
  exit 1
fi

# 1) Start tailscaled in userspace (no NET_ADMIN needed on Railway)
"${TSD_BIN}" \
  --state=mem: \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --outbound-http-proxy-listen=localhost:1056 &
TSD_PID=$!

# tiny wait to avoid "doesn't appear to be running" races
sleep 0.7

# 2) Bring the node onto your tailnet
"${TS_BIN}" up \
  --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
  --hostname="${RAILWAY_SERVICE_NAME:-railway}-$(hostname)" \
  --accept-routes=true \
  --accept-dns=false \
  --reset

# Show IP for debugging
"${TS_BIN}" ip || true
"${TS_BIN}" status || true

# Optional: quick connectivity probe (comment out after first success)
# nc -vz "${DB_HOST}" "${DB_PORT:-3306}" || true

# 3) Start your app
exec node server.js   # or: exec npm start
