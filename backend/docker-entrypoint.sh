#!/usr/bin/env bash
set -euo pipefail

# 1) Start tailscaled in userspace (no NET_ADMIN needed on Railway)
#    --state=mem: ephemeral; --tun=userspace-networking gives us a netstack
/usr/sbin/tailscaled \
  --state=mem: \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --outbound-http-proxy-listen=localhost:1056 &

# 2) Bring the node onto your tailnet
#    Use an Ephemeral or Tagged TS_AUTHKEY from the admin panel
tailscale up \
  --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
  --hostname="${RAILWAY_SERVICE_NAME:-railway}-$(hostname)" \
  --accept-routes=true \
  --accept-dns=false \
  --reset

echo "Tailscale IPs:"
tailscale ip || true
tailscale status || true

# 3) Start your app
exec node server.js   # or: exec npm start
