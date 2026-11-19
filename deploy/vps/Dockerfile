# MicroWorld: isolated, static frontend. No shared VPS services or credentials.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts --no-package-lock
COPY . .
# Poly Haven textures are imported only at build time; fallback is procedural.
RUN npm test && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/vps/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
