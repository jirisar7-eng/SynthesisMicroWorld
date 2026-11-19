#!/usr/bin/env bash
# MW-018: isolated web-only portrait camera and HUD visual refinement for MW-012 VPS.
# The authoritative sim container, named volume, Caddyfile, DNS and other services
# are never changed. Keeps old web image for one-command rollback.
set -euo pipefail

if [[ "${1:-}" != "--apply" ]]; then
  echo 'Usage: MW018_APPROVED_SHA=<exact 40-character SHA> bash deploy/vps/mw011/web-only-mw018.sh --apply'
  exit 2
fi
test "$(hostname -s)" = tatovacesta || { echo 'BLOCKED: wrong host'; exit 2; }
test "$(id -un)" = uadmin || { echo 'BLOCKED: wrong user'; exit 2; }

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
test "$(git branch --show-current)" = feature/mw-018-mobile-camera-hud-polish || {
  echo 'BLOCKED: wrong git branch'; exit 2;
}
test -z "$(git status --porcelain)" || { echo 'BLOCKED: dirty git tree'; exit 2; }
SHA="$(git rev-parse HEAD)"
test "${MW018_APPROVED_SHA:-}" = "$SHA" || {
  echo 'BLOCKED: exact approved SHA mismatch'; exit 2;
}
test -f "$HOME/.local/state/mw011/compose.edge.yaml" || {
  echo 'BLOCKED: missing previously approved edge overlay'; exit 2;
}
test "$(docker inspect -f '{{.State.Health.Status}}' microworld011_preview-sim-1)" = healthy || {
  echo 'BLOCKED: authoritative simulation is not healthy'; exit 2;
}
test "$(docker inspect -f '{{.State.Health.Status}}' microworld011_preview-web-1)" = healthy || {
  echo 'BLOCKED: previous web version is not healthy'; exit 2;
}
test "$(docker inspect -f '{{.State.Running}}' caddy_proxy)" = true || {
  echo 'BLOCKED: Caddy proxy is not running'; exit 2;
}

export MW011_RELEASE="${SHA:0:12}"
export MW011_HOST_PORT=18585
COMPOSE=(docker compose
  -f deploy/vps/mw011/compose.yaml
  -f "$HOME/.local/state/mw011/compose.edge.yaml")

"${COMPOSE[@]}" config -q
"${COMPOSE[@]}" config --format json | python3 -c '
import json,sys
p=json.load(sys.stdin)
assert p["name"]=="microworld011_preview"
assert set(p["services"])=={"web","sim"}
w=p["services"]["web"]
assert len(w["ports"])==1
port=w["ports"][0]
assert port["host_ip"]=="127.0.0.1" and int(port["published"])==18585
assert "synthesis_edge" in w["networks"]
assert "microworld011-web" in w["networks"]["synthesis_edge"].get("aliases",[])
assert not p["services"]["sim"].get("ports")
print("MW018_TOPOLOGY_PASS")
'

SIM_BEFORE="$(docker inspect -f '{{.Id}}' microworld011_preview-sim-1)"
OLD_WEB="$(docker inspect -f '{{.Config.Image}}' microworld011_preview-web-1)"
case "$OLD_WEB" in local/mw011-web:*) ;; *)
  echo 'BLOCKED: unexpected previous web image'; exit 2 ;;
esac
OLD_RELEASE="${OLD_WEB#local/mw011-web:}"
docker image inspect "$OLD_WEB" >/dev/null

CFG=/var/www/server/Caddyfile
CADDY_SHA_BEFORE="$(sha256sum "$CFG" | cut -d' ' -f1)"
DOMAIN=microworld.tatovacesta.cz
auth_code="$(curl --noproxy '*' -sS --max-time 10 \
  --resolve "$DOMAIN:443:127.0.0.1" -o /dev/null -w '%{http_code}' \
  "https://$DOMAIN/svet/")"
test "$auth_code" = 401 || { echo 'BLOCKED: existing HTTPS auth is not HTTP 401';exit 2; }

rollback_needed=0
rollback() {
  rc=$?
  trap - EXIT
  if (( rollback_needed )); then
    echo "MW018_ROLLBACK_ATTEMPT previous=$OLD_WEB"
    export MW011_RELEASE="$OLD_RELEASE"
    "${COMPOSE[@]}" up -d --no-deps --no-build web || true
    docker inspect -f 'WEB_AFTER_ROLLBACK={{.State.Health.Status}}' \
      microworld011_preview-web-1 || true
  fi
  exit "$rc"
}
trap rollback EXIT

echo "MW018_WEB_ONLY_BUILD sha=$SHA previous=$OLD_WEB"
"${COMPOSE[@]}" build web
rollback_needed=1
"${COMPOSE[@]}" up -d --no-deps --no-build web

ready=0
for attempt in $(seq 1 30); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' microworld011_preview-web-1)" == healthy ]]; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = 1
test "$(docker inspect -f '{{.Config.Image}}' microworld011_preview-web-1)" = "local/mw011-web:${SHA:0:12}"

test "$(docker inspect -f '{{.Id}}' microworld011_preview-sim-1)" = "$SIM_BEFORE"
test "$(docker inspect -f '{{.State.Health.Status}}' microworld011_preview-sim-1)" = healthy
test "$(sha256sum "$CFG" | cut -d' ' -f1)" = "$CADDY_SHA_BEFORE"

curl -fsS --max-time 6 http://127.0.0.1:18585/healthz | grep -Fxq ok
curl -fsS --max-time 12 -o /dev/null http://127.0.0.1:18585/api/world
docker exec caddy_proxy wget -q -O - http://microworld011-web:8080/healthz |
  grep -Fxq ok
auth_code="$(curl --noproxy '*' -sS --max-time 10 \
  --resolve "$DOMAIN:443:127.0.0.1" -o /dev/null -w '%{http_code}' \
  "https://$DOMAIN/svet/")"
test "$auth_code" = 401
rollback_needed=0
echo "MW018_WEB_ONLY_PASS sha=$SHA HTTPS_AUTH=401 SIM=UNCHANGED CADDY=UNCHANGED"
echo "WEB_ROLLBACK_IMAGE=$OLD_WEB"
