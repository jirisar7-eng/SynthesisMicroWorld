# MW-GOD-001 — autoritativní božské schopnosti

**Stav:** izolovaná vývojová větev `feature/mw-god-001`, vzniklá z `feature/mw-012-vps-unified-preview`. Není sloučená do `main`; VPS ani produkce nebyly tímto commitem upravené. Nasazení je samostatná změna vyžadující souhlas a aktuální preflight.

## Funkce

- **13 schopností:** déšť, sucho, obnova úrody, vznik lesa, pramen, kamenité ložisko, léčení, nálada, inspirace, požehnání, požár, povodeň, meteorit.
- **Cíle:** planeta (počasí), přesný bod na souši, žijící NPC a skupina v definovaném poloměru; na 3D mapě je možné klepnout na člověka nebo na souš.
- **Parametry:** intenzita 1–5; skupinová oblast 2–25 jednotek; GPS není používáno. Souřadnice patří čistě hernímu světu.
- **Autonomie:** zásahy nemění pracovní úkoly, rozhodovací logiku, partnerství ani cíle NPC. Jejich další jednání stále určuje simulace.
- **Následky:** dopad počasí na zdroje, skutečné nové těžitelné lokality, zdravotní a emoční změny, časově omezené požární/záplavové nebezpečí, zničení zdrojů, záznam v životopise, kronice a seznamu božských zásahů.
- **Vizuální vrstva:** nové lesy, prameny, ložiska a orientační značky katastrof ve Three.js; jednoduché efekty, nikoli realistické fyzikální animace.
- **Čas:** pozastavení, pokračování a rychlosti 0,25× / 1× / 2× / 4×.
- **Obnova:** 10 soukromých kontrolních bodů, automaticky vytvořených před změnami, a potvrzované navrácení do historického stavu. Vrácení zvyšuje epochu světa, aby si 3D klient nespletl oprávněný návrat v čase s chybou serveru.
- **Uložení:** záznamy, poškození, nově vytvořené objekty, časové řízení a kontrolní body přežijí restart serverového kontejneru v dedikovaném volume.

## Bezpečnost

API je ve výchozím stavu **zamčené**. Pokud na VPS není nastaven silný `MW_GOD_ADMIN_TOKEN` (32–256 znaků bez mezer), server vrátí 503 a nepřijímá žádné změny.

- `GET /api/god/catalog`: veřejně čitelný katalog pouze uvnitř soukromého preview.
- `GET /api/god/history`, `GET /api/god/checkpoints`: vyžadují Bearer token.
- `POST /api/god/action`, `POST /api/god/control`, `POST /api/god/restore`: validovaný JSON + Bearer token + ID příkazu.
- Striktní výčet schopností, typů cílů, omezení souřadnic, rozsahů a časových rychlostí; max. 4 kB tělo požadavku, 20 změn za minutu, oddělení souběžných transakcí.
- Každý požadavek se spáruje s ID a hashem obsahu (idempotence). Chybné či neúspěšné změny vrací svět z kopie v paměti.
- Uložení probíhá přes atomickou výměnu souboru, stejně tak soukromé checkpointy. Klient nikdy nezná cestu do souborového systému.
- Token není ve frontendovém bundle ani v `localStorage` a nepřechází do herních snapshotů. Zadává se znovu po obnovení stránky.
- Preview je dostupné pouze na loopbacku VPS a přes SSH tunel; žádná nová veřejná Caddy routa ani nový otevřený port.

**Důležité pro budoucí nasazení:** `MW_GOD_ADMIN_TOKEN` musí být před spuštěním Compose bezpečně exportován do prostředí provádějícího `deploy/vps/mw011/apply.sh`; `compose.yaml` ho do kontejneru pouze předává. Nikdy ho nevkládat do Gitu, chatů, auditních logů ani veřejných URL.

## Technické limity

Požár, povodeň a meteorit jsou **herní hazardy**, ne CFD/hydrodynamika či plně deformovatelný terén. Meteorit zanechává vizuální kráterovou značku, nikoli skutečný výkop do výškové mapy. Les/pramen/ložisko jsou skutečné zdrojové uzly; vizualizace používá jednoduchou geometrii. Šíření ohně mezi stromy, evakuace, pohyb vody, poškození budov a komplexní fyzikální model nejsou součástí MW-GOD-001.

Server s VPS simulací zůstává zdrojem pravdy. Klientská stránka nesmí synchronizovat svůj lokální experiment se serverovými zásahy.

## Ověření

CI workflow `MW-GOD-001 Checks` spouští `npm test` a `npm run build:offline`. Součástí jsou jednotkové a HTTP integrační testy autentizace, validace, obnovy checkpointů, autonomie, persistence, vedlejších důsledků katastrof a kompatibility s aktuální serializací.

Před jakýmkoliv schválením VPS preview je navíc nutné ověřit skutečnou 3D scénu na Androidu, klikání na skupiny a terén, úspěšný i odmítnutý API zápis, sledování následků, obnovení kontrolního bodu, restart serveru a dlouhodobou stabilitu světa. Automatický build sám o sobě není dokladem vizuální ani provozní akceptace.

**Žádný automatický merge, deployment ani zásah do produkce.**
