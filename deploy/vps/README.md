# MW-VPS-001 — isolované nasazení MicroWorld na tatovacesta

## Co je připraveno
- **Zdroj:** `jirisar7-eng/SynthesisMicroWorld`, pracovní větev `deploy/vps-mw-001`, založená nad MW-006D.
- **Runtime:** staticky sestavená aktuální hra (Vite/Three.js) v samostatném nginx kontejneru, bez přístupu k produkční DB, SMTP ani jiným službám.
- **Compose projekt:** `microworld_private`; unikátní lokální obraz `local/microworld:<git_sha>`.
- **Port:** pouze `127.0.0.1:18583` na VPS, nikoli `0.0.0.0`. Docker síť je oddělená bridge; příchozí port je publikovaný pouze na VPS loopbacku.
- **Zachováno:** původní Caddy, Mailcow, STT, CMS a ostatní projekty. Žádný Docker volume ani DB není měněn.
- **Verifikace:** automatické jednotkové testy a Vite build jsou součástí sestavení obrazu; vlastní Nginx `/healthz` i routes `/svet/`, `/prehled/` a `/lide/`.
- **Realita:** toto je webová hra běžící v prohlížeči. Přesun na VPS sám ještě nepřidává serverové běžící NPC ani persistentní uložené světy.

## Autoritativní zdroje v Notionu
- [VPS — Kniha provozu a auditů](https://www.notion.so/404a127f178a81ecac6fc0e0f096632b)
- [05 — Bezpečný runbook](https://www.notion.so/404a127f178a81ffb3d5c6695b094dad)
- [03 — Caddy a domény](https://www.notion.so/404a127f178a81fc9746d20f3f81d2fe)

Poslední zde doložený úplný VPS snapshot je ze **25. října 2026** a **není živým snapshotem**. Přesný stav musí být ověřen preflightem přímo z VPS. Runbook výslovně zakazuje vydávat návrh za provedený příkaz a vyžaduje doložený redigovaný výstup.

## Příprava a nasazení přes Termux / SSH

### 0. Přihlásit se na VPS
Z telefonu použij svůj již existující SSH profil nebo běžné zabezpečené přihlášení `uadmin`. Nikdy neposílej soukromé klíče, hesla ani tokeny do Notionu nebo chatu.

### 1. Připravit pracovní kopii (MUTATING pouze v nové uživatelské složce)
Spusť na VPS jako `uadmin`:
```bash
set -euo pipefail
test "$(hostname -s)" = "tatovacesta"
mkdir -p "$HOME/projects"
cd "$HOME/projects"
test ! -e SynthesisMicroWorld-VPS
git clone --branch deploy/vps-mw-001 --single-branch https://github.com/jirisar7-eng/SynthesisMicroWorld.git SynthesisMicroWorld-VPS
cd SynthesisMicroWorld-VPS
git status --short
git rev-parse HEAD
```
Pokud složka už existuje, **neprovádět** `git reset --hard`, `clean -fd` ani přepis: nejprve zjistit její aktuální stav a bezpečně navázat.

### 2. Povinná kontrola stavu (READ_ONLY)
```bash
cd "$HOME/projects/SynthesisMicroWorld-VPS"
bash deploy/vps/preflight.sh
```
Při neplatném hostname, obsazeném portu jinou službou, neznámém Docker oprávnění nebo nedostatku zdrojů **STOP**. Neodstavovat jiné služby ani čistit obrazy, volumes či cache.

### 3. Nasazení (MUTATING)
Až po vyhodnocení preflightu a potvrzení rozsahu:
```bash
cd "$HOME/projects/SynthesisMicroWorld-VPS"
bash deploy/vps/deploy.sh --apply
```
Skript builduje *pouze* `web` a nahrazuje výhradně stack `microworld_private`. Při chybě healthchecku zkusí obnovit poslední obraz stejného projektu nebo novou službu zastaví.

### 4. Ověření z telefonu nebo tabletu
Na **tom zařízení, ze kterého otevíráš hru**, spusť SSH tunel:
```bash
ssh -N -L 18583:127.0.0.1:18583 uadmin@TVUJ_ZAVEDENY_SSH_HOST
```
Následně otevři v prohlížeči:
- `http://127.0.0.1:18583/svet/`
- `http://127.0.0.1:18583/prehled/`
- `http://127.0.0.1:18583/lide/`

Bez tunelu z internetu nebude web dostupný; to je **záměr**. Není potřeba DNS, Caddy ani přidaný veřejný port.

## Případné HTTPS později (samostatná změna)

Cílová adresa: `microworld.tatovacesta.cz`. Až bude aktuálně ověřena DNS zóna a Caddy route:
1. Kontrolovaně připojit **jen** MicroWorld k existující edge síti `synthesis-edge-net`.
2. Přidat **samostatnou Caddy routu**, která proxyuje pouze `microworld-web:8080` s přihlášením; **hash hesla se vytváří lokálně na VPS a nikdy necommitovat do repozitáře**.
3. `caddy validate`, jednorázový reload Caddy (bez restartu jiných kontejnerů), externí HTTPS/auth smoke a rollback.
4. Nepoužívat běžné veřejné statické nasazení bez přístupu, pokud má hra zůstat jen pro vlastníka.

## Budoucí soustavná simulace

Po schválení webové fáze lze přidat samostatný simulační proces, SQLite nebo PostgreSQL, versioned saves, autosave, replay, persistence po restartu a WebSocket stream do klienta. Tato fáze **není implementovaná** v MW-VPS-001 a vyžaduje samostatný návrh stavu, záloh, migrací a testů.

## Provozní evidence
- `CHANGE_ID: MW-VPS-001`
- `STATUS: PREPARED / NOT_RUN` dokud nebude doložen skutečný výstup z VPS.
- `SOURCE: GitHub deploy/vps-mw-001 + Notion VPS runbook`
- `SCOPE: independent microworld_private compose project only`
- `ROLLBACK: previous local/microworld:<sha> image, no shared stack changes`
