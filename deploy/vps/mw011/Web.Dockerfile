# MW-012: static Three.js viewer with an internal only server snapshot proxy.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --ignore-scripts --no-package-lock
COPY . .
RUN npm test && SKIP_POLYHAVEN_ASSETS=1 npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/vps/mw011/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
