# --- deps layer (adjust to your stack) ---
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# --- runtime + tailscale ---
FROM node:20-slim AS runner
WORKDIR /app

# Install tailscale (userspace works in unprivileged containers)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl iproute2 \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
      | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null \
  && curl -fsSL https://pkgs.tailscale.com/stable/debian/tailscale.list \
      | tee /etc/apt/sources.list.d/tailscale.list \
  && apt-get update && apt-get install -y --no-install-recommends tailscale \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PORT=3001
EXPOSE 3001
CMD ["/usr/local/bin/docker-entrypoint.sh"]
