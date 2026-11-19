# MW-006B — Living Settlement / review checklist

**Scope:** experimental implementation on `feature/mw-006b-living-settlement`; Vercel Preview only. `main` and VPS remain unchanged.

## Delivered in this slice

### 1. Terrain remembers real traffic
- Every world position traversed by a walking NPC adds pressure to a local ground cell.
- Repeated walks visibly wear irregular earthen paths. No fixed road layout, no player road placement.
- Rain and drought affect the speed at which paths become visible.
- The world map HUD and the observer overview show trail counts.

### 2. Items cannot teleport into production
- Every log, stone, berry, fruit, twig and seed stays a unique object with a container and position.
- Harvested items are created in a *real citizen's carried inventory*, visible alongside the citizen, then become usable stock only on delivery.
- A construction project reserves its true input items. A builder visits the source piles, carries small batches to the construction site and may begin construction only after all items have arrived. Reserved materials cannot be spent twice.
- Building a warehouse creates covered space but DOES NOT automatically teleport goods under its roof.
- Residents physically pick up exposed stock and haul it to the warehouse. Moisture then changes according to shelter status.
- Eating requires the NPC to visit the actual container holding food, and the exact piece eaten disappears.
- Small-world drawing: each inventory item is one visible 3D object; larger worlds will need an audited LOD strategy without losing accounting identity.

### 3. Structures reflect the landscape and community
- NPCs decide the type of structure from actual shelter/storage/farming/social needs.
- Candidate building locations are evaluated for terrain slope, previously explored places, existing buildings, nearby obstacles and locally created paths.
- No more fixed world-coordinate list of predetermined building plots is used by the live building planner.
- House, warehouse, farm, community hall and workshop still have real material recipes and 3D designs.
- Volunteer helpers can participate in building. Community construction and trips are logged with causes and outcomes.
- This is a first planning heuristic, not yet a full agent-to-agent architecture negotiation system.

### 4. A person can become discontented
- Frustration is accumulated from repeated unmet needs including hunger, loneliness, exhaustion, low mood and exposure to rain without shelter. Good conditions gradually reduce it.
- At sufficiently high tension and after personally discovering a safe distant location, an individual can voluntarily leave the village.
- The individual must collect wood and food from separate source containers, physically walk to a personally known location, pitch a tent using two real logs, store food there, and live in that camp for a while.
- It may later choose to return; leftover supplies travel back with it. Every step produces a life event.
- Conflicts can happen during real two-person meetings. Hostile encounters reduce mutual trust and must not simultaneously count as friendship.
- Life cards track individual frustration, social status, departure history and biography.

## What is not falsely claimed

- Fully autonomous second villages with production chains, diplomacy, commerce, warfare, diplomacy outcomes, migration waves and multiple leaders are **not implemented yet**.
- The sim does not yet include full family creation, aging, childbirth, death, diseases or individual long-term lifespan progression.
- Children will not participate in adult intimacy. The private 18+ scope permits modeling adult relationship choices and violent outcomes, but complete systems and rendering rules require later development.
- World state currently resets with a full page reload. A persistent authoritative server on the user's VPS is a future separately approved deployment.
- Free third-party libraries and models (Yuka, Recast, Rapier, CC0 textures) are candidates, not yet imported; evaluate license, performance and need before adding dependencies.
- The current small-scene rendering still uses simplified 3D models. Detailed PBR materials, foliage and modern realistic human character rigs remain future work.
- Build success, pure simulation unit tests and on-device WebGL acceptance are **different gates**.

## Acceptance scenario (current slice)

1. Run the game and watch a group of six residents for 6–10 game days without intervention.
2. Check that foot trails appear only where actual residents have walked.
3. Inspect a log after collection: it must be visibly carried and remain unavailable to village construction until delivered.
4. Watch an autonomous building project: the material pile decreases only by picked-up/reserved items, the building site receives real items, construction begins after the final delivery and the finished building is entered in the registry.
5. Watch an NPC move wet outdoor wood to the finished roofed warehouse. Moisture and heat output must change accordingly.
6. Inspect an NPC's personal card: record actual actions and personal relations, social needs and stress.
7. Under prolonged stress conditions, check whether a citizen can voluntarily pack, walk to an explored location, pitch a tent, remain there and return. Do not assume exile is inevitable if the village is healthy.
8. Test Android landscape/portrait touch rotation, map and life card page routing, FPS and memory usage.
9. Run all Node test suites, including headless simulation days, and `npm run build`.

## Follow-on milestones

- **MW-007:** fully autonomous new settlement including separate inventory, territory, agriculture, trade routes and migration.
- **MW-008:** genuine economic exchanges between settlements, decisions on neutrality, trade, alliances, war, casualties and diplomatic consequences.
- **MW-009:** long-term human life-cycle, partnerships, adult intimacy choices, families, genetic/learned characteristics, aging, health, mortality and legacy.
- **MW-010:** ecology, seasonality, water and soil, wildlife, realistic fire and material simulation.
- **MW-011:** realistic organic art direction: PBR terrain, water, trees, buildings, character models, animation quality and rendering LOD for mobile.
- **MW-012:** long-term history, deterministic replay, family trees and private persistence on VPS; 30 NPC / 2 game-year life validation followed by population scaling.

**Policy:** no merge to `main` or VPS deployment until branch acceptance and explicit approval.
