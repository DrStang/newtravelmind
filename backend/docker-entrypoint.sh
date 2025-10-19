#!/usr/bin/env bash
set -euo pipefail

# ---------- config ----------
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

# ---------- resolve binaries ----------
TS_BIN="$(command -v tailscale || true)"
TSD_BIN="$(command -v tailscaled || true)"
NCAT_BIN="$(command -v ncat || true)"
echo "tailscaled: ${TSD_BIN:-<missing>} | tailscale: ${TS_BIN:-<missing>} | ncat: ${NCAT_BIN:-<missing>}"
[[ -z "${TSD_BIN}" || -z "${TS_BIN}" || -z "${NCAT_BIN}" ]] && { echo "Required binary missing"; exit 1; }

# ---------- start tailscaled (persistent state) ----------
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &
sleep 0.8

# ---------- join tailnet ----------
if [[ ! -s "${STATE_PATH}" ]]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi
echo "Tailscale IPv4: $(${TS_BIN} ip -4 || true)"

# ---------- wait for SOCKS ----------
for i in {1..30}; do
  if "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
    echo "SOCKS ready on ${SOCKS_HOST}:${SOCKS_PORT}"
    break
  fi
  echo "Waiting for SOCKS ${SOCKS_HOST}:${SOCKS_PORT}... ($i/30)"; sleep 0.5
done

# ---------- DB target ----------
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Set DB_HOST to your VPS 100.x.y.z}" | tr -d '[:space:]')"
DB_PORT_CLEAN="${DB_PORT:-3306}"

# ---------- create a tiny helper to avoid quoting hell ----------
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

# export values for the helper
export SOCKS_HOST SOCKS_PORT
export TARGET_HOST="${DB_HOST_CLEAN}"
export TARGET_PORT="${DB_PORT_CLEAN}"

# ---------- start local forwarder 127.0.0.1:${LOCAL_FWD_PORT} -> (SOCKS5) -> DB ----------
command -v pkill >/dev/null 2>&1 && pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true

# NOTE: bind address goes after -l; no -s in listen mode
# --sh-exec runs the helper per-connection (no fragile quoting)
"${NCAT_BIN}" -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k \
  --sh-exec "${PROXY_HELPER}" \
  > /tmp/ncat-forward.log 2>&1 &

# verify listener
READY=0
for i in {1..30}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    READY=1; break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/30)"; sleep 0.5
done

if [[ "${READY}" -ne 1 ]]; then
  echo "❌ ncat listener failed to bind. Forwarder log:"
  tail -n +200 /tmp/ncat-forward.log || true
  exit 1
fi

# ---------- point app at local forward and launch ----------
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"
exec node server.js
