#!/usr/bin/env bash
# MW-012 READ ONLY. No Docker starts/stops, Git mutations, Caddy writes or auth reads.
set -euo pipefail
EXPECTED_HOST=tatovacesta
EXPECTED_USER=uadmin
PORT="${MW011_HOST_PORT:-18585}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
test "$(hostname -s)" = "$EXPECTED_HOST" || { echo "BLOCKED: wrong host"; exit 2; }
test "$(id -un)" = "$EXPECTED_USER" || { echo "BLOCKED: wrong user"; exit 2; }
test "$(git branch --show-current)" = "feature/mw-012-vps-unified-preview" || {
  echo "BLOCKED: wrong branch";exit 2;
}
test -z "$(git status --porcelain)" || { echo "BLOCKED: uncommitted changes";exit 2; }
test "$PORT" = 18585 || { echo "BLOCKED: unexpected TCP port";exit 2; }
if docker info >/dev/null 2>&1; then
  D=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  D=(sudo -n docker)
else
  echo "BLOCKED: no Docker permission";exit 2
fi
export MW011_RELEASE="$(git rev-parse --short=12 HEAD)"
export MW011_HOST_PORT="$PORT"
COMPOSE=( "${D[@]}" compose -f deploy/vps/mw011/compose.yaml )
"${COMPOSE[@]}" config -q
printf 'MW012_PREFLIGHT_READ_ONLY host=%s user=%s sha=%s\n' \
  "$(hostname -s)" "$(id -un)" "$(git rev-parse HEAD)"
printf '%s\n' '-- local resources --'
df -h / | tail -n 1
free -h | sed -n '1,2p'
printf '%s\n' '-- existing preview containers only --'
"${D[@]}" ps -a --filter label=com.docker.compose.project=microworld011_preview \
  --format 'name={{.Names}} status={{.Status}} ports={{.Ports}}'
printf '%s\n' '-- loopback listener 18585 --'
if command -v ss >/dev/null; then ss -ltn '( sport = :18585 )';fi
owned_web="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
if [[ -z "$owned_web" ]] && command -v ss >/dev/null && \
   [[ -n "$(ss -ltnH '( sport = :18585 )')" ]]; then
   echo 'BLOCKED: port 18585 is occupied outside MW-012.' >&2
   exit 2
fi
if [[ -n "$owned_web" ]]; then
  image="$("${D[@]}" inspect --format '{{.Config.Image}}' "$owned_web")"
  case "$image" in local/mw011-web:*) ;; *)
    echo 'BLOCKED: existing preview container has an unexpected image.' >&2;exit 2 ;;
  esac
fi
printf '%s\n' '-- docker compose project isolation --'
"${COMPOSE[@]}" config --format json | python3 -c '
import json,sys
p=json.load(sys.stdin)
assert p["name"]=="microworld011_preview"
assert set(p["services"])=={"sim","web"}
web=p["services"]["web"]
assert all(x.get("host_ip")=="127.0.0.1" and int(x["published"])==18585 for x in web["ports"])
assert not p["services"]["sim"].get("ports")
print("isolated_project=PASS ports=loopback-only services=sim,web")
'
if [[ -e /var/www/server/Caddyfile ]]; then
  printf 'caddy_config_sha256='
  sha256sum /var/www/server/Caddyfile | cut -d' ' -f1
fi
printf '%s\n' 'MW012_PREFLIGHT_PASS: read-only. Review before running --apply.'
