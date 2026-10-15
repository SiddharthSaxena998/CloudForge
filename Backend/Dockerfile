# CloudForge backend image (used by docker-compose.yml)
FROM node:20-alpine

# git: GitHub deploys | unzip/tar: uploaded archives | curl: fetch cloudflared
RUN apk add --no-cache git unzip tar curl ca-certificates

# Cloudflare Tunnel binary for the free public links (TARGETARCH = arm64 on Apple Silicon, amd64 on Intel)
ARG TARGETARCH
RUN curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${TARGETARCH}" \
 && chmod +x /usr/local/bin/cloudflared

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5000
# Runs as root on purpose: it needs access to the mounted Docker socket (see docs/PHASE1.md)
CMD ["node", "server.js"]
