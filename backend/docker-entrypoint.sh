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
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"
NCAT_BIN="$(command -v ncat)"

echo "ncat version: $(${NCAT_BIN} --version 2>&1 | head -1)"
echo "Checking if anything already binds ${LOCAL_FWD_PORT}..."
ss -lntp 2>/dev/null | grep -E "127\.0\.0\.1:${LOCAL_FWD_PORT}\b" || echo " - nothing on 127.0.0.1:${LOCAL_FWD_PORT}"

echo "Probing SOCKS: ${SOCKS_HOST}:${SOCKS_PORT}"
${NCAT_BIN} -z "${SOCKS_HOST}" "${SOCKS_PORT}" && echo " - SOCKS port accepts TCP" || echo " - SOCKS probe failed (may still be fine)"

# ---------- try a simple bind first (no --sh-exec) ----------
echo "Trying plain bind on 127.0.0.1:${LOCAL_FWD_PORT} (no proxy) just to test binding..."
set -x
${NCAT_BIN} -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k -vv >/tmp/ncat-bind-test.log 2>&1 &
BIND_PID=$!
set +x
sleep 0.5
if ${NCAT_BIN} -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
  echo "✅ Plain bind succeeded; freeing test listener."
  kill "${BIND_PID}" 2>/dev/null || true
else
  echo "❌ Plain bind FAILED on ${LOCAL_FWD_PORT}. Dumping log and trying fallback port 31337..."
  cat /tmp/ncat-bind-test.log || true
  kill "${BIND_PID}" 2>/dev/null || true
  LOCAL_FWD_PORT=31337
  echo "Retrying plain bind on 127.0.0.1:${LOCAL_FWD_PORT}..."
  ${NCAT_BIN} -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k -vv >/tmp/ncat-bind-test2.log 2>&1 &
  BIND_PID=$!
  sleep 0.5
  if ${NCAT_BIN} -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "✅ Plain bind succeeded on fallback port ${LOCAL_FWD_PORT}; freeing test listener."
    kill "${BIND_PID}" 2>/dev/null || true
  else
    echo "❌ Still can’t bind. Logs:"
    cat /tmp/ncat-bind-test2.log || true
    ss -lntp || true
    exit 1
  fi
fi

# ---------- start the real forwarder (listen locally, sh-exec a SOCKS5 dialer per connection) ----------
PROXY_HELPER="/usr/local/bin/ncat-proxy.sh"
cat > "${PROXY_HELPER}" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
SOCKS_HOST="${SOCKS_HOST:-127.0.0.1}"
SOCKS_PORT="${SOCKS_PORT:-1055}"
TARGET_HOST="${TARGET_HOST:?}"
TARGET_PORT="${TARGET_PORT:?}"

echo "PROXY_HELPER: dialing ${TARGET_HOST}:${TARGET_PORT} via socks5 ${SOCKS_HOST}:${SOCKS_PORT}" >&2

# One-shot connectivity probe (non-fatal). Exit code 0 on success, non-0 on fail.
if ncat --proxy "${SOCKS_HOST}:${SOCKS_PORT}" --proxy-type socks5 -z "${TARGET_HOST}" "${TARGET_PORT}" 2>&1; then
  echo "PROXY_HELPER: probe OK" >&2
else
  echo "PROXY_HELPER: probe FAILED" >&2
fi

# Now turn into the actual TCP pipe
exec ncat -vv --proxy "${SOCKS_HOST}:${SOCKS_PORT}" --proxy-type socks5 "${TARGET_HOST}" "${TARGET_PORT}"
EOS
chmod +x "${PROXY_HELPER}"


export SOCKS_HOST SOCKS_PORT
export TARGET_HOST="${DB_HOST_CLEAN}"
export TARGET_PORT="${DB_PORT_CLEAN}"

echo "Starting forwarder: 127.0.0.1:${LOCAL_FWD_PORT} -> (SOCKS5 ${SOCKS_HOST}:${SOCKS_PORT}) -> ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}"
# write forwarder logs to stdout so you see them in Railway
set -x
${NCAT_BIN} -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k -vv \
  --sh-exec "${PROXY_HELPER}" &
set +x

# verify listener is up before launching the app
for i in {1..30}; do
  if ${NCAT_BIN} -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "✅ Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/30)"
  sleep 0.5
done
if ! ${NCAT_BIN} -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
  echo "❌ Forwarder still not listening; printing process list and sockets:"
  ps aux | grep -E 'tailscaled|ncat' | grep -v grep || true
  ss -lntp || true
  exit 1
fi

# Point your app at the local forward
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

echo "LAUNCHING APP with DB_HOST=${DB_HOST} DB_PORT=${DB_PORT}"
exec node server.js

