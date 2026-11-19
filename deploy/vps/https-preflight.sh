#!/usr/bin/env bash
# MW-HTTPS-002 / READ ONLY. Never prints the Caddyfile, secrets, or auth hashes.
set -euo pipefail
test "$(hostname -s)" = "tatovacesta" || { echo "BLOCKED: wrong host"; exit 2; }
test "$(id -un)" = "uadmin" || { echo "BLOCKED: wrong user"; exit 2; }
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
test "$(git branch --show-current)" = "deploy/vps-https-002" || { echo "BLOCKED: wrong branch"; exit 2; }
echo '=== MW-HTTPS-002 / READ ONLY PREFLIGHT ==='
echo "git_sha=$(git rev-parse HEAD)"
echo "-- game service --"
docker ps --filter 'name=^/microworld_private-web-1$' --format 'name={{.Names}} status={{.Status}} ports={{.Ports}}'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 4 http://127.0.0.1:18583/healthz)" = 200 || {
  echo 'BLOCKED: local game HTTP health is not 200'; exit 2;
}
echo 'game_http=200'
echo "-- network membership (names only) --"
test "$(docker network inspect -f '{{.Name}}' synthesis-edge-net 2>/dev/null)" = synthesis-edge-net || {
  echo 'BLOCKED: synthesis-edge-net does not exist'; exit 2;
}
for name in caddy_proxy microworld_private-web-1; do
  echo "container=$name"
  docker inspect -f '{{range $name,$net := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$name" || true
done
docker inspect -f '{{range $name,$net := .NetworkSettings.Networks}}{{println $name}}{{end}}' caddy_proxy |
  grep -Fxq synthesis-edge-net || {
    echo 'BLOCKED: Caddy is not on expected synthesis-edge-net'; exit 2;
  }
echo "-- Caddy bind and syntax (no file contents) --"
CADDYFILE=/var/www/server/Caddyfile
test -f "$CADDYFILE" || { echo 'BLOCKED: expected host Caddyfile missing'; exit 2; }
source_mount="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' caddy_proxy)"
test "$source_mount" = "$CADDYFILE" || { echo 'BLOCKED: Caddyfile bind differs from Notion'; exit 2; }
stat -c 'config_size=%s modified=%y' "$CADDYFILE"
sha256sum "$CADDYFILE" | awk '{print "config_sha256="$1}'
docker exec caddy_proxy caddy version
docker exec caddy_proxy caddy validate --config /etc/caddy/Caddyfile >/dev/null
echo 'existing_caddy_syntax=PASS'
if grep -Fq 'microworld.tatovacesta.cz' "$CADDYFILE"; then
  echo 'WARNING: target host is already mentioned in Caddyfile; inspect before applying another route.'
else
  echo 'target_caddy_route=ABSENT'
fi
echo "-- DNS snapshot (public hostnames only) --"
for hostname in tatovacesta.cz www.tatovacesta.cz microworld.tatovacesta.cz; do
  printf '%s A = ' "$hostname"
  ips="$(getent ahostsv4 "$hostname" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u | paste -sd ',' - || true)"
  echo "${ips:-NOT_RESOLVED}"
done
echo "-- Compose overlay syntax --"
running_image="$(docker inspect -f '{{.Config.Image}}' microworld_private-web-1)"
case "$running_image" in local/microworld:*) export MICROWORLD_RELEASE="${running_image#local/microworld:}";; *)
  echo 'BLOCKED: Unexpected MicroWorld runtime image'; exit 2;;
esac
export MICROWORLD_PORT=18583
docker compose --project-name microworld_private -f deploy/vps/compose.yaml -f deploy/vps/compose.https.yaml config -q
echo 'https_compose_config=PASS'
echo 'PREFLIGHT_COMPLETE: no changes. Review DNS and target route before HTTPS apply.'
