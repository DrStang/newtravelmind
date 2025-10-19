#!/usr/bin/env bash
set -euo pipefail

# --- config (env-driven) ---
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"   # mount a Railway Volume at /data
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-31337}"        # 13306 may not bind on some PaaS; 31337 is safe

# DB target (your VPS's Tailscale IP + port)
ORIG_DB_HOST="${DB_HOST?Missing DB_HOST (set to your VPS 100.x.y.z)}"
ORIG_DB_PORT="${DB_PORT:-3306}"

# --- resolve binaries ---
TS_BIN="$(command -v tailscale || true)"
TSD_BIN="$(command -v tailscaled || true)"
NCAT_BIN="$(command -v ncat || true)"
[[ -z "${TS_BIN}" || -z "${TSD_BIN}" || -z "${NCAT_BIN}" ]] && { echo "Missing tailscale/tailscaled/ncat"; exit 1; }

# --- start tailscaled (userspace netstack + SOCKS5) ---
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &

sleep 0.6

# --- join tailnet (auth key only on first boot) ---
if [[ ! -s "${STATE_PATH}" ]]; then
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

# --- wait for SOCKS to accept connections ---
for _ in {1..40}; do
  if "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then break; fi
  sleep 0.25
done
if ! "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
  echo "SOCKS not ready on ${SOCKS_HOST}:${SOCKS_PORT}"; exit 1
fi

# --- tiny helper used per-connection to dial DB via SOCKS5 (avoids quote issues) ---
PROXY_HELPER="/usr/local/bin/ncat-proxy.sh"
cat > "${PROXY_HELPER}" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
SOCKS_HOST="${SOCKS_HOST:-127.0.0.1}"
SOCKS_PORT="${SOCKS_PORT:-1055}"
TARGET_HOST="${TARGET_HOST:?}"
TARGET_PORT="${TARGET_PORT:?}"
exec ncat --proxy "${SOCKS_HOST}:${SOCKS_PORT}" --proxy-type socks5 "${TARGET_HOST}" "${TARGET_PORT}"
EOS
chmod +x "${PROXY_HELPER}"

# exported for the helper
export SOCKS_HOST SOCKS_PORT
export TARGET_HOST="${ORIG_DB_HOST}" TARGET_PORT="${ORIG_DB_PORT}"

# --- start local forwarder: 127.0.0.1:LOCAL_FWD_PORT -> (SOCKS5) -> ORIG_DB_HOST:ORIG_DB_PORT ---
# (no -s with -l; bind address goes right after -l)
"${NCAT_BIN}" -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k \
  --sh-exec "${PROXY_HELPER}" >/dev/null 2>&1 &

# --- wait for local listener to bind ---
for _ in {1..40}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then break; fi
  sleep 0.25
done
if ! "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
  echo "Local forward not listening on 127.0.0.1:${LOCAL_FWD_PORT}"; exit 1
fi

# --- point the app at the local forward and launch ---
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

exec node server.js
