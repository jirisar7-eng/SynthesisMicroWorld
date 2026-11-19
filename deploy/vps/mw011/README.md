# MW-012 — VPS preview: server a 3D prohlizec spolecne

**Stav:** soubory jsou pripravene v GitHubu, ale samotne nasazeni na VPS musi probehnout na hostu tatovacesta a byt overeno jeho skutecnym vystupem.

## Co se spousti
- Samostatny Compose projekt microworld011_preview, bez zasahu do stareho MicroWorldu, Caddy, DNS nebo dalsich aplikaci.
- Node.js simulacni server s 30 obyvateli, profesemi, ostrovy, plavidly, nebezpecnym morem a samostatnym ulozistem.
- Three.js web s jedinym vystavenym portem 127.0.0.1:18585 (jen VPS loopback).
- Nginx interne zprostredkuje jen cteci /api/world, /api/status, /api/events. Webova stranka nacita opravdu bezici svet kazdych pet sekund a nevytvari druhy konkurencni svet.
- Ulozeny svet zustava v dedikovanem Docker volume pri restartu.
- U serveroveho sveta jsou upravy a bozi zasahy docasne vypnute: viewer zatim jen pozoruje, bez predstirani zapisovani do serveru.

## Na VPS pres SSH z Termuxu
Prihlas se jiz nastavenym soukromym SSH profilem jako uadmin na tatovacesta. Zadna hesla nebo klice neposilej do chatu. Prikazy nize spoustej v terminalu na VPS, nikoliv primo v Androidu.

### Nova pracovni kopie
Spustit pouze pokud adresar jeste neexistuje:

    mkdir -p "$HOME/projects"
    cd "$HOME/projects"
    git clone --branch feature/mw-012-vps-unified-preview --single-branch git@github.com:jirisar7-eng/SynthesisMicroWorld.git SynthesisMicroWorld-MW012
    cd SynthesisMicroWorld-MW012
    git status --short
    git rev-parse HEAD

Pokud git@github.com neni autorizovane, pouzij svuj existujici bezpecny pristup do soukromeho repozitare. Neposilej osobni access token jako parametr prikazu. Pokud adresar existuje, neprepisuj ho resetem ani clean; nejprve jej zkontroluj.

### Povinna kontrola pouze pro cteni

    bash deploy/vps/mw011/preflight.sh

Musi skoncit MW012_PREFLIGHT_PASS. Kontroluje presny host/user, vetve, port, projektovou izolaci a existujici kontejnery. V pripade BLOCKED zastav.

Pred dalsim krokem porovnej vystup git rev-parse HEAD s commit SHA zeleneho GitHub Actions MW-012 smoke run. Nedelat deploy neovereneho commitu.

### Spusteni pouze novych sluzeb

    MW011_APPROVED_SHA="$(git rev-parse HEAD)" bash deploy/vps/mw011/apply.sh --apply

Skript spusti jen sim a web v samostatnem projektu, kontroluje zpravu o zive simulaci a v pripade jiz existujiciho sveta udela pred vymenou jeho soukromou kopii. Vystup MW012_DEPLOY_PASS znamena, ze zakladni kontrola prosla. Bez nej nasazeni nelze prohlasit za hotove.

Skript sam o sobe neupravuje Caddy, DNS, port 443, webovou produkci ani ulozene svety starych projektů. Zadny docker volume prune, docker system prune ani compose down -v.

## Otevreni z Androidu
V jinem terminalu na **stejnem telefonu nebo tabletu**, kde budes hru otevirat:

    ssh -N -L 18585:127.0.0.1:18585 uadmin@TVUJ_NASTAVENY_SSH_HOST

Pouzij svou existujici SSH adresu/alias misto textu TVUJ_NASTAVENY_SSH_HOST. V prohlizeci stejneho zarizeni:
- http://127.0.0.1:18585/svet/
- http://127.0.0.1:18585/prehled/
- http://127.0.0.1:18585/lide/
- http://127.0.0.1:18585/api/status

Bez tunelu neni aplikace z internetu dostupna. Pro bezpecne verejne HTTPS a prihlaseni je nutna zvlastni, kontrolovana zmena Caddy a DNS az po overeni preview.

## Aktualni poznamky
- Dvouleta automaticka simulace MW-011: 15 zijicich, 6 narozenych deti, 4 pary, 15 uspesnych plaveb tam a zpet, 6 plavidel, 21 umrti. Demograficke vyvazeni jeste neni finalni.
- Web je v serverovem rezimu pouze cteci; realtime multiplayer a bozi zasahy nad autoritativnim serverem zatim chybi.
- Casovy posun a obnoveni snapshotu po restartu musi skutecne overit nasazovaci test na VPS.
- Pokud neni pristup k SSH, nelze jen pomoci GitHub konektoru prohlasit nasazeni za provedene.
