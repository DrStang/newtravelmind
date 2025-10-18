#!/usr/bin/env bash
set -euo pipefail

# ---------------------------
# Config (via env, with sane defaults)
# ---------------------------
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"   # must be on a Railway Volume
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"            # stable name for this service in Tailscale
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

# ---------------------------
# Resolve required binaries
# ---------------------------
TS_BIN="$(command -v tailscale || true)"
TSD_BIN="$(command -v tailscaled || true)"
NCAT_BIN="$(command -v ncat || true)"

echo "tailscaled: ${TSD_BIN:-<missing>} | tailscale: ${TS_BIN:-<missing>} | ncat: ${NCAT_BIN:-<missing>}"

if [[ -z "${TSD_BIN}" || -z "${TS_BIN}" ]]; then
  echo "ERROR: tailscale binaries not found on PATH." >&2
  exit 1
fi
if [[ -z "${NCAT_BIN}" ]]; then
  echo "ERROR: ncat not found. Install the 'ncat' package (Debian: apt-get install -y ncat) in the FINAL image." >&2
  exit 1
fi

# ---------------------------
# Start tailscaled (userspace) with PERSISTENT STATE
# ---------------------------
"${TSD_BIN}" \
  --state="${STATE_PATH}" \
  --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" \
  --outbound-http-proxy-listen=localhost:1056 &

# tiny settle to avoid races
sleep 0.8

# ---------------------------
# Bring the node onto your tailnet
#   - First boot: uses TS_AUTHKEY
#   - Later boots: reuse state; no key needed
# ---------------------------
if [[ ! -s "${STATE_PATH}" ]]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up \
    --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" \
    --accept-routes=true \
    --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up \
    --hostname="${HOSTNAME_TAG}" \
    --accept-routes=true \
    --accept-dns=false
fi

echo "Tailscale IPv4: $(${TS_BIN} ip -4 || true)"

# ---------------------------
# Wait for the Tailscale SOCKS5 proxy to be ready
# ---------------------------
for i in {1..30}; do
  if "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
    echo "SOCKS ready on ${SOCKS_HOST}:${SOCKS_PORT}"
    break
  fi
  echo "Waiting for SOCKS ${SOCKS_HOST}:${SOCKS_PORT}... ($i/30)"
  sleep 0.5
done

# ---------------------------
# Prepare DB target (your VPS's Tailscale IP and DB port)
# ---------------------------
DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST (set to your VPS's 100.x.y.z)}" | tr -d '[:space:]')"
DB_PORT_CLEAN="${DB_PORT:-3306}"

# ---------------------------
# Start local forwarder:
#   127.0.0.1:${LOCAL_FWD_PORT}  ->  (SOCKS5 ${SOCKS_HOST}:${SOCKS_PORT})  ->  ${DB_HOST_CLEAN}:${DB_PORT_CLEAN}
# Use 'listen' ncat and spawn an outbound ncat per connection via --sh-exec.
# (Do NOT combine --proxy with -l in one ncat; it's invalid.)
# ---------------------------
# kill any stale listener from previous runs (ignore if pkill isn't present)
if command -v pkill >/dev/null 2>&1; then
  pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true
fi

"${NCAT_BIN}" -l 127.0.0.1 -p "${LOCAL_FWD_PORT}" -k \
  --sh-exec "${NCAT_BIN} --proxy ${SOCKS_HOST}:${SOCKS_PORT} --proxy-type socks5 ${DB_HOST_CLEAN} ${DB_PORT_CLEAN}" \
  > /tmp/ncat-forward.log 2>&1 &

# Prove the local listener actually bound before starting your app
READY=0
for i in {1..30}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    READY=1
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/30)"
  sleep 0.5
done

if [[ "${READY}" -ne 1 ]]; then
  echo "❌ ncat listener failed to bind. Forwarder log:"
  tail -n +1 /tmp/ncat-forward.log || true
  exit 1
fi

# Optional debug (uncomment if needed)
# ps aux | grep -E 'tailscaled|ncat' | grep -v grep || true
# if command -v ss >/dev/null 2>&1; then ss -lntp || true; fi
# tail -n +1 /tmp/ncat-forward.log || true

# ---------------------------
# Point your app at the local forwarder
# ---------------------------
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"

# ---------------------------
# Launch your app (adjust if you use npm start / yarn)
# ---------------------------
exec node server.js