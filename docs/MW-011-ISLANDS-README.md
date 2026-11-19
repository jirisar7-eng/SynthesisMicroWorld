# MW-011 — Druhý ostrov, plavba, mořští tvorové a vznik profesí

**Stav: vývojová větev / není merge do main / nebylo nasazeno na VPS.**
Základ: `feature/mw-009b-family-lifecycle`. Soukromý server a veřejný Three.js frontend zůstávají oddělené; současná 3D aplikace se automaticky nesynchronizuje se serverovým světem.

## Co je ve zdrojovém kódu

- **Druhý ostrov**: samostatná modelovaná souš poblíž (86,0), vlastní stromy, plody, kámen a pramen. Kolize a výška terénu sdílejí stejná data s 3D scénou.
- **Souš versus moře**: chůze NPC smí proběhnout pouze po fyzicky přístupné pevnině. A* už není omezena na první ostrov; mezi ostrovy nelze přejít ani se teleportovat.
- **Autonomní objevování**: NPC musí osobně dorazit k pobřeží a ostrov spatřit. Jejich znalost světa se nespouští globálním odhalením mapy.
- **Vynález a přeprava**: jedinec může experimentem přijít na konstrukci voru; materiály s reálnými ID musí vyzvednout z konkrétního skladovacího místa, donést na pobřeží a fyzicky spotřebovat. Pro loď se přidává kámen. Nesmí vzniknout loď z nulových zásob.
- **Mořeplavba**: pohyb člunu, voru či plavce probíhá po jednotlivých krocích, s únavou a rizikem. Stav výpravy, poloha plavidla a rezervace plavidla jsou součástí snapshotu. Na druhém ostrově se používá místní depot; jeho potraviny nelze instantně spotřebovat na prvním.
- **Mořští tvorové**: tři jednoduché modelované bytosti s hladem, útokem do omezené vzdálenosti, zraněním oběti a omezenými rybími zásobami. Jde o herní model, nikoli reálný biologický ekosystém.
- **Profese**: ze skutečně získaných zkušeností vznikají základní i kombinované profese. Osobní rozhovor umožňuje učit vybranou dovednost a předat ověřený technologický nápad; součástí je původ znalosti a časový limit učení.
- **Kronika**: první objevy, vynálezy, plavby, útoky a získané profese se zaznamenávají jako události konkrétních NPC.

## Ověřování

`npm test` spouští základní i nové izolované a integrační testy, které zahrnují migraci a restart výpravy. Workflow `MicroWorld Preview Checks` navíc spouští `node scripts/mw-life-001.mjs` s `MW_TEST_DAYS=730`, `MW_TEST_STEP=2`, následně Vite build. Úspěch zeleného workflow **sám o sobě není důkaz**, že obyvatele přirozeně potká objevení ostrova, vznik rodin nebo že komunita dlouhodobě prosperuje: skutečné metriky dvouletého testu se musí hodnotit zvlášť.

Při hodnocení číst `MW_LIFE_001_REPORT`, zejména `final.living`, `final.born`, `maritime.discoveredBy`, `maritime.crossings`, `maritime.vessels`, `professions`. Zero v těchto polích znamená **mechanika byla otestována izolovaně, ale nedošlo k jejímu emergentnímu použití**.

## Omezení / nepokryté body

1. Animace plavidel, materiálů a mořských tvorů jsou jednoduché 3D prototypy, ne realistická hydrodynamika.
2. Není implementované společné cestování více pasažérů, migrace celé vesnice ani zahraniční obchod.
3. Role jsou prahová pravidla nad zkušenostmi, nikoli obecný generativní systém neomezených nových profesí.
4. Systém umí předat popsané znalosti, ale ještě nedokáže samostatně objevit libovolný nový technický princip.
5. Ekologie, úmrtnost, párování a ochrana před vymíráním vyžadují dlouhodobé scénářové ladění.
6. Živá serverová simulace ještě není nasazena; veřejná 3D appka a serverový svět dosud nemají synchronizaci.
7. Produkci, sdílený Caddy, DNS, ostatní projekty VPS ani existující uložené světy **nepřepisovat**.

## Provozní bezpečnost

Pro ověření použít pouze CI a izolované preview. Případné VPS nasazení vyžaduje samostatný schválený preflight a přesný git commit, dle `deploy/vps/MW-010-SERVER-README.md`. Nikdy nepoužívat `down -v`, globální Docker prune, zásah do Mailcow nebo restart sdíleného Caddy.
