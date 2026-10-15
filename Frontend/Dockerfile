# CloudForge dashboard image (used by docker-compose.yml)
# Runs the Vite dev server: fine for local/demo use. A production build needs a separate
# server preset (the Lovable config builds for Cloudflare Workers by default).
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

ENV VITE_API_URL=http://localhost:5000/api
EXPOSE 8080
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]
