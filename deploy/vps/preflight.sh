#!/usr/bin/env bash
# READ_ONLY: never modifies Docker, Caddy, DNS, UFW, application state or repo.
set -euo pipefail
if [[ "$(hostname -s)" != "tatovacesta" ]]; then
  echo "BLOCKED: wrong host. Expected tatovacesta." >&2; exit 2
fi
echo "=== MW VPS PREFLIGHT / READ ONLY ==="
printf 'host=%s user=%s date=%s\n' "$(hostname -s)" "$(id -un)" "$(date -Is)"
printf 'repo=%s\n' "$(git rev-parse --show-toplevel 2>/dev/null || echo UNKNOWN)"
printf 'branch=%s\n' "$(git branch --show-current 2>/dev/null || echo UNKNOWN)"
printf 'sha=%s\n' "$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
printf '\n-- resources --\n'
df -h /
free -h
printf '\n-- Docker access --\n'
if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  echo "BLOCKED: Docker socket unavailable for this user. NOT a container outage."
  exit 2
fi
"${DOCKER[@]}" version --format 'client={{.Client.Version}} server={{.Server.Version}}'
"${DOCKER[@]}" compose version
printf '\n-- project name collision checks --\n'
"${DOCKER[@]}" ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}' |
  grep -E '(^|[-_])(microworld|caddy_proxy|tatovacesta_app|stt|mailcow)([-_]|$| )' || true
printf '\n-- host port 18583 --\n'
if command -v ss >/dev/null 2>&1; then ss -ltn '( sport = :18583 )'; fi
printf '\n-- Caddy config metadata only (no contents or credentials) --\n'
if [[ -f /var/www/server/Caddyfile ]]; then
  stat -c '%n bytes=%s modified=%y' /var/www/server/Caddyfile
  sha256sum /var/www/server/Caddyfile
else
  echo 'WARNING: expected Caddy bind source not found. Stop before public routing.'
fi
printf '\n-- existing project and local endpoint --\n'
if curl -fsS --max-time 2 http://127.0.0.1:18583/healthz >/dev/null; then
  echo 'Port 18583 responds to an HTTP healthcheck (verify its owner before changing).'
else
  echo 'No response on 18583; this is normal before first deployment.'
fi
printf '\nPREFLIGHT COMPLETE: evidence only, no writes. Verify port ownership, free resources and shared services before MUTATING phase.\n'
