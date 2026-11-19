#!/usr/bin/env bash
# MW-HTTPS-002 / MUTATING. Adds one private HTTPS host to the shared Caddyfile.
# No credentials or hashes are printed, logged in Git, or passed via CLI argv.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'Usage: bash deploy/vps/https-apply.sh --apply'
  echo 'First review: bash deploy/vps/https-preflight.sh (READ ONLY)'
  exit 2
fi
test "$(hostname -s)" = "tatovacesta" || { echo 'BLOCKED: wrong host'; exit 2; }
test "$(id -un)" = "uadmin" || { echo 'BLOCKED: wrong user'; exit 2; }
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
test "$(git branch --show-current)" = "deploy/vps-https-002" ||
  { echo 'BLOCKED: wrong branch'; exit 2; }
test -z "$(git status --porcelain)" || { echo 'BLOCKED: uncommitted changes'; exit 2; }
CFG=/var/www/server/Caddyfile
DOMAIN=microworld.tatovacesta.cz
BACKUP_DIR="$HOME/.local/state/microworld"
PRIV=()
route_written=0
edge_added=0
restore_on_failure() {
  local rc=$?
  if (( rc != 0 )); then
    echo 'MW_HTTPS_FAIL: rolling back only MicroWorld HTTPS changes.' >&2
    if (( route_written )); then
      "${PRIV[@]}" sh -c 'cat "$1" > "$2"' _ "$BACKUP" "$CFG" || true
      docker exec caddy_proxy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
    fi
    if (( edge_added )); then
      docker compose --project-name microworld_private \
        -f deploy/vps/compose.yaml up -d --no-build --no-deps web >/dev/null 2>&1 || true
    fi
    echo 'Rollback attempted. Verify Caddy and MicroWorld health; do not assume success.' >&2
  fi
}
trap restore_on_failure EXIT

# Reject changes when the new name does not resolve to the same public IPv4
# endpoint as the existing www site. DNS is managed separately at the provider.
target_ip="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u | paste -sd ',' - || true)"
www_ip="$(getent ahostsv4 www.tatovacesta.cz 2>/dev/null | awk '$2=="STREAM"{print $1}' | sort -u | paste -sd ',' - || true)"
if [[ -z "$target_ip" || -z "$www_ip" || "$target_ip" != "$www_ip" ]]; then
  echo "BLOCKED: DNS mismatch. target=${target_ip:-NOT_RESOLVED}; www=${www_ip:-NOT_RESOLVED}" >&2
  echo 'Set the DNS A record and rerun READ ONLY preflight; do not edit Caddy yet.' >&2
  exit 2
fi
test -f "$CFG" || { echo 'BLOCKED: Caddyfile missing'; exit 2; }
if grep -Fq "$DOMAIN" "$CFG"; then
  echo 'BLOCKED: Caddyfile already contains target hostname; inspect manually, no duplicate route.' >&2
  exit 2
fi
docker inspect -f '{{range $name,$net := .NetworkSettings.Networks}}{{println $name}}{{end}}' caddy_proxy |
  grep -Fxq synthesis-edge-net || { echo 'BLOCKED: Caddy not on edge network'; exit 2; }
test "$(docker network inspect -f '{{.Name}}' synthesis-edge-net 2>/dev/null)" = synthesis-edge-net ||
  { echo 'BLOCKED: edge network missing'; exit 2; }
source_mount="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' caddy_proxy)"
test "$source_mount" = "$CFG" || { echo 'BLOCKED: Caddy bind source mismatch'; exit 2; }
docker exec caddy_proxy caddy validate --config /etc/caddy/Caddyfile >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:18583/healthz)" = 200 ||
  { echo 'BLOCKED: original MicroWorld local health failed'; exit 2; }

# Caddyfile is possibly root-owned; prepare sudo only if needed.
if [[ ! -w "$CFG" ]]; then
  sudo -v
  PRIV=(sudo -n)
  "${PRIV[@]}" test -w "$CFG" || { echo 'BLOCKED: no permission to modify Caddyfile'; exit 2; }
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/Caddyfile-before-mw-https-$(date -u +%Y%m%dT%H%M%SZ).bak"
"${PRIV[@]}" cp -p "$CFG" "$BACKUP"
"${PRIV[@]}" chmod 600 "$BACKUP"
echo "MW_HTTPS_BACKUP_CREATED path=$BACKUP"

running_image="$(docker inspect -f '{{.Config.Image}}' microworld_private-web-1)"
case "$running_image" in local/microworld:*) export MICROWORLD_RELEASE="${running_image#local/microworld:}";; *)
  echo 'BLOCKED: MicroWorld image unexpected'; exit 2;;
esac
export MICROWORLD_PORT=18583
docker compose --project-name microworld_private -f deploy/vps/compose.yaml \
  -f deploy/vps/compose.https.yaml config -q

# No password in shell history, repository, command-line arguments or logs.
printf 'Heslo pro MicroWorld (min. 5 znaku; delsi je bezpecnejsi): ' >&2
IFS= read -rs first; printf '\n' >&2
printf 'Zopakuj heslo: ' >&2
IFS= read -rs second; printf '\n' >&2
if [[ "${#first}" -lt 5 ]]; then
  unset first second
  echo 'BLOCKED: heslo musi mit alespon 5 znaku' >&2; exit 2
fi
if [[ "$first" != "$second" ]]; then
  unset first second
  echo 'BLOCKED: potvrzeni hesla se neshoduje' >&2; exit 2
fi
unset second
hash="$(printf '%s\n' "$first" | docker exec -i caddy_proxy caddy hash-password --algorithm bcrypt)"
unset first
if [[ ! "$hash" =~ ^\$2[aby]\$ ]]; then
  echo 'BLOCKED: password hash generation failed' >&2; exit 2
fi

# Only the MicroWorld web container is recreated to add a second network.
docker compose --project-name microworld_private -f deploy/vps/compose.yaml \
  -f deploy/vps/compose.https.yaml up -d --no-build --no-deps web
edge_added=1
if ! docker exec caddy_proxy sh -c 'wget -q -O - http://microworld-web:8080/healthz' |
     grep -Fxq ok; then
  echo 'BLOCKED: Caddy cannot reach microworld-web:8080 through edge network' >&2; exit 2
fi

# Appending preserves the inode of the host file bind-mounted into Caddy.
# Hash is stored only on this VPS with Caddy configuration; never commit it.
{
  printf '\n# MW-HTTPS-002: private MicroWorld (generated locally)\n'
  printf '%s\n' "$DOMAIN {" '    encode zstd gzip' '    basic_auth {'
  printf '        owner %s\n' "$hash"
  printf '%s\n' '    }' '    reverse_proxy microworld-web:8080 {' \
    '        header_up -Authorization' '    }' '}'
} | "${PRIV[@]}" tee -a "$CFG" >/dev/null
unset hash
route_written=1

if ! docker exec caddy_proxy caddy validate --config /etc/caddy/Caddyfile >/dev/null; then
  echo 'BLOCKED: new shared Caddyfile did not validate' >&2; exit 2
fi
docker exec caddy_proxy caddy reload --config /etc/caddy/Caddyfile >/dev/null
# The exact new origin must demand authentication. 401 is the safe result.
ok=0
for i in $(seq 1 18); do
  code="$(curl -k -sS --max-time 4 -o /dev/null -w '%{http_code}' \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null || true)"
  if [[ "$code" = 401 ]]; then ok=1; break; fi
  sleep 2
done
if (( ! ok )); then
  echo 'BLOCKED: unauthenticated HTTPS did not return required HTTP 401' >&2; exit 2
fi
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:18583/healthz)" = 200 ||
  { echo 'BLOCKED: local MicroWorld health regression'; exit 2; }
echo "MW_HTTPS_PASS domain=$DOMAIN unauthenticated=401 upstream=microworld-web:8080"
echo 'Caddy validated + reloaded without restarting the shared proxy; verify real public TLS in browser.'
