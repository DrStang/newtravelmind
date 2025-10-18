#!/usr/bin/env bash
set -euo pipefail

TS_BIN="$(command -v tailscale || true)"
TSD_BIN="$(command -v tailscaled || true)"
NCAT_BIN="$(command -v ncat || true)"
STATE_PATH="${TS_STATE_PATH:-/data/tailscaled.state}"
HOSTNAME_TAG="${TS_HOSTNAME:-newtravelmind}"

SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"

echo "tailscaled: ${TSD_BIN} | tailscale: ${TS_BIN} | ncat: ${NCAT_BIN}"
if [[ -z "${TSD_BIN}" || -z "${TS_BIN}" ]]; then
  echo "ERROR: tailscale binaries not found" >&2; exit 1
fi
if [[ -z "${NCAT_BIN}" ]]; then
  echo "ERROR: ncat not found. Did you install 'nmap' in the final image stage?" >&2; exit 1
fi

# 1) Start tailscaled with persistent state
"${TSD_BIN}" --state="${STATE_PATH}" --tun=userspace-networking \
  --socks5-server="${SOCKS_HOST}:${SOCKS_PORT}" --outbound-http-proxy-listen=localhost:1056 &

# small settle
sleep 0.8

# 2) Join tailnet (auth only on first boot)
if [ ! -s "${STATE_PATH}" ]; then
  echo "First boot: authenticating to Tailscale..."
  "${TS_BIN}" up --authkey="${TS_AUTHKEY:?Missing TS_AUTHKEY}" \
    --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
else
  echo "Reusing existing Tailscale state..."
  "${TS_BIN}" up --hostname="${HOSTNAME_TAG}" --accept-routes=true --accept-dns=false
fi

echo "TS IPv4: $(${TS_BIN} ip -4 || true)"

# 3) Wait for SOCKS to listen
for i in {1..30}; do
  if "${NCAT_BIN}" -z "${SOCKS_HOST}" "${SOCKS_PORT}" 2>/dev/null; then
    echo "SOCKS ready on ${SOCKS_HOST}:${SOCKS_PORT}"
    break
  fi
  echo "Waiting for SOCKS ${SOCKS_HOST}:${SOCKS_PORT}... ($i/30)"
  sleep 0.5
done

# --- after "SOCKS ready on 127.0.0.1:1055" ---

DB_HOST_CLEAN="$(printf "%s" "${DB_HOST?Missing DB_HOST}" | tr -d '[:space:]')"  # VPS TS IP, e.g. 100.66.175.61
DB_PORT_CLEAN="${DB_PORT:-3306}"
LOCAL_FWD_PORT="${TS_LOCAL_FORWARD_PORT:-13306}"
SOCKS_HOST=127.0.0.1
SOCKS_PORT=1055
NCAT_BIN="$(command -v ncat)"

# stop any stale listener (redeploys)
pkill -f "ncat .* -l .* -p ${LOCAL_FWD_PORT}" 2>/dev/null || true

# LISTEN locally, and for each incoming connection, sh-exec a new ncat that dials
# the DB through the SOCKS5 proxy. This is the valid pattern (no --proxy with -l).
"${NCAT_BIN}" -l -k -p "${LOCAL_FWD_PORT}" -s 127.0.0.1 \
  --sh-exec "${NCAT_BIN} --proxy ${SOCKS_HOST}:${SOCKS_PORT} --proxy-type socks5 ${DB_HOST_CLEAN} ${DB_PORT_CLEAN}" \
  >/tmp/ncat-forward.log 2>&1 &

# prove the local listener is actually up before starting Node
for i in {1..30}; do
  if "${NCAT_BIN}" -z 127.0.0.1 "${LOCAL_FWD_PORT}" 2>/dev/null; then
    echo "Local forward listening on 127.0.0.1:${LOCAL_FWD_PORT}"
    READY=1
    break
  fi
  echo "Waiting for local forward 127.0.0.1:${LOCAL_FWD_PORT}... ($i/30)"
  sleep 0.5
done

# if it never bound, dump logs and fail fast (so you don’t start Node against a dead port)
if [ "${READY:-0}" -ne 1 ]; then
  echo "❌ ncat listener failed to bind. Forwarder log:"
  tail -n +1 /tmp/ncat-forward.log || true
  exit 1
fi

# Point the app at the local forward
export DB_HOST="127.0.0.1"
export DB_PORT="${LOCAL_FWD_PORT}"
