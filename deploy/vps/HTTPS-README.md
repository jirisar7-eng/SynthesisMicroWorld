# MW-HTTPS-002 — Private HTTPS host `microworld.tatovacesta.cz`

**Status:** prepared in GitHub; **NOT RUN on real VPS.** The actual static MicroWorld web was already verified by its owner on VPS at `127.0.0.1:18583` and served `/svet/`, `/prehled/`, `/lide/`.

## Verified source evidence
- Notion: [VPS Caddy and domains](https://www.notion.so/404a127f178a81fc9746d20f3f81d2fe) states `caddy_proxy` is on Docker network `synthesis-edge-net` and the host `/var/www/server/Caddyfile` is bind-mounted as `/etc/caddy/Caddyfile`. This was a historical snapshot, not fresh access.
- Notion: [Safe change runbook](https://www.notion.so/404a127f178a81ffb3d5c6695b094dad) requires a live preflight, backup/validate/reload, no disclosure of auth hashes or secrets, and smoke checks of existing web and mail origins.
- The current VPS owner terminal proved that MicroWorld was actually deployed with SHA `c1eb942fad8569e87785cd3ccd22f85dd4d36f65` and `MW_DEPLOY_PASS` from the localhost-only Docker stack.
- DNS for `microworld.tatovacesta.cz` has **not been independently verified**, and our remote lookup did not resolve it. The domain should not be claimed live until the record is created and observed from the VPS/public internet.

## Scope and safety
- Optional `deploy/vps/compose.https.yaml` joins **only** `microworld_private-web-1` to existing external `synthesis-edge-net` with alias `microworld-web`.
- The game's own port remains bound exclusively to `127.0.0.1:18583`; no new host port, Docker volume, DB, SMTP or new public service.
- The only planned change outside the MicroWorld container is appending **one protected site block** to the existing host Caddyfile. No restart or replacement of `caddy_proxy`.
- Public HTTPS is protected by Caddy `basic_auth`, with a **fresh password entered locally without echo**. Its bcrypt hash is stored **only on VPS**. The Authorization header is removed before forwarding to static Nginx.
- Preserve Caddyfile inode because it is bind-mounted. Back up under `~/.local/state/microworld` with mode 0600 and restore original bytes via truncating the same file path on failure.
- Script refuses to operate when a target Caddy route already exists, Docker edge network differs, hostname/identity are wrong, the local game fails, Git is dirty, or DNS does not match the existing www origin.

## Stage A: DNS and infrastructure — READ ONLY
On `[VPS — uadmin]`:

```bash
set -euo pipefail
test "$(hostname -s)" = tatovacesta
cd ~/projects/SynthesisMicroWorld-VPS
test -z "$(git status --porcelain)" || { echo "Uncommitted files: STOP"; exit 2; }
git fetch origin refs/heads/deploy/vps-https-002:refs/remotes/origin/deploy/vps-https-002
git switch -c deploy/vps-https-002 --track origin/deploy/vps-https-002
bash deploy/vps/https-preflight.sh
```

The branch switch is a local **working-copy mutation** but does not touch any running container or Caddy. The preflight itself is READ ONLY.

Observe the A records shown for `www.tatovacesta.cz` and `microworld.tatovacesta.cz`. If MicroWorld is absent, create with the DNS provider an **A record**:
- Name/host: `microworld`
- Type: `A`
- Value: the currently verified public IPv4 of `www.tatovacesta.cz` at the VPS (historical Notion `91.241.9.124` must **not** be accepted without checking live).
- Optional TTL: 300 seconds if provider supports it
- **Do not** change the apex, MX, SPF, DKIM, DMARC, mail host, wildcard, NS or registrar settings. Do not create an AAAA record unless IPv6 reaches the same Caddy.

Check `getent ahostsv4 microworld.tatovacesta.cz` after DNS is effective and run the preflight again. If the DNS provider is not connected or accessible, its record must be added from the provider account manually. The GitHub repository cannot make DNS changes.

## Stage B: HTTPS activation — MUTATING
After verifying the sanitized preflight output and the correct DNS, a designated owner runs:

```bash
cd ~/projects/SynthesisMicroWorld-VPS
bash deploy/vps/https-apply.sh --apply
```

This step **does mutate** Docker membership of the MicroWorld container and the shared Caddyfile. It asks for a strong **new** password at the terminal (min. 16 characters, echoed neither to terminal nor Git) and prompts for confirmation. Never send it to chat, GitHub, Notion or shell history.

On success, the expected marker is:
```
MW_HTTPS_PASS domain=microworld.tatovacesta.cz unauthenticated=401 upstream=microworld-web:8080
```
Unprotected requests MUST receive HTTP 401. The user then opens:
- `https://microworld.tatovacesta.cz/svet/`
- `https://microworld.tatovacesta.cz/prehled/`
- `https://microworld.tatovacesta.cz/lide/`

The browser should prompt for username `owner` and the password the user entered on the VPS. Confirm full valid TLS (without `-k`), proper UI on Android and application behavior. Public HTTPS may require certificate issuance time after DNS propagation.

## Stage C: smoke checks, recovery and handoff
- Expected new site: HTTP 401 without credentials; 200 after owner login; actual TLS from an independent browser.
- Verify `https://www.tatovacesta.cz`, the Mailcow web host and current STT active site still respond exactly as before.
- `http://127.0.0.1:18583/healthz` stays HTTP 200 on VPS.
- If Caddy validation or access gating fails, the apply script restores the backed-up Caddyfile, attempts to reload previous config and reverts the MicroWorld-only networking overlay. It does not touch other service configurations. A rollback attempt **must be verified**, not assumed successful.
- After acceptance, add a durable change record to the VPS Notion runbook: hostname, local game SHA, config checksum before/after, Git branch, result and rollback path. Never paste passwords, bcrypt hashes or unredacted Caddyfile contents.

## Important distinction
HTTPS reverse proxy only exposes the existing browser-based game privately. It does **not** make NPC simulation continuous after the browser closes and does not add database-backed world saves. A future server process and persistence model are separate tasks.
