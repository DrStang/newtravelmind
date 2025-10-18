# --- deps layer (adjust to your stack) ---
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm i --omit=dev

# --- runtime + tailscale ---
FROM node:20-slim AS runner
WORKDIR /app

# Fetch Tailscale static binaries (choose a current version)
ARG TS_VER=1.88.4
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl ncat procps \
 && ARCH="$(dpkg --print-architecture)" \
 && curl -fsSL "https://pkgs.tailscale.com/stable/tailscale_${TS_VER}_${ARCH}.tgz" \
    | tar -xz -C /usr/local/bin --strip-components=1 \
        "tailscale_${TS_VER}_${ARCH}/tailscale" \
        "tailscale_${TS_VER}_${ARCH}/tailscaled" \
 && rm -rf /var/lib/apt/lists/*


COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ...everything above unchanged...

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/tailscale /usr/local/bin/tailscaled

ENV PORT=3001
EXPOSE 3001

# IMPORTANT: use ENTRYPOINT so nothing can skip the script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
