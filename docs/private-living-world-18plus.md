# SYNTHESIS MicroWorld — Private 18+ Living World

Status: design plan for subsequent milestones, not an implementation claim.
Project owner: single private player. Current Preview remains on Vercel; persistent simulation may be hosted on a private VPS when requested.

## Fundamental rule

The player changes world conditions. NPCs remain autonomous. Every essential object and interaction has physical state, origin, location, action cost, ownership and logged consequences.

The adult designation allows the design to encompass mature interpersonal themes including intimacy between adults, affairs, crimes, violence, war, survival and death. These are simulated choices and consequences, not predetermined scripts. Age/consent requirements apply to adult intimacy; child characters are excluded from sexual content. An explicit-graphics layer is a separate future decision and not implemented in this milestone.

## Material and building ontology

- Items carry IDs, types, location or container, moisture and eventually temperature, condition, quality, owner, provenance and decay state.
- The player must see the physical consequences of gathering. In the small world, each log, rock and fruit has a corresponding object in the scene. Carrying needs a visible bundle; storage is a real building or container.
- Production recipes must consume their inputs; stoves burn actual fuel and cause physical effects such as heat.
- Baskets and crates are constructed from actual fibers/wood. Once made, goods can use them for storage/transport.
- Rain increases wetness of exposed wood; shelter stops wetting and permits drying; combustion efficiency depends on measured wetness. Future engines add humidity, airflow, firespread and realistic heating of nearby rooms.
- Farms require found seeds, suitable soil, water, care and time; the first prototype uses seeds of wild berries to grow berry crops. Later species-specific seeds, orchards, cereal fields and livestock must preserve biological consistency.
- Production models evolve into homes, covered warehouses, granaries, workshops, smithies, meeting houses, farms, barns, wells, market stalls and health services.

## Lifecycle and autonomous settlement dynamics — roadmap

### MW-006 — First material-life vertical slice (implemented in preview)
Physical catalog, item-by-item visual inventory, carrying, weathered firewood, basic baskets, stone extraction, apples, first seeded field, multiple building meshes, truthful NPC biography card. One starting settlement, a handful of preset available building locations.

### MW-007 — Individual autonomy beyond the starting settlement
1. Each person owns private necessities, social needs and preferred relationships. Social tension is increased by unmet needs, exploitation, conflicts, unmet promises or hostility.
2. The agent may voluntarily take time away from the central settlement. It takes real supplies, chooses a discovered safe point, carries its items, puts up a temporary tent and may return after several days.
3. The agent may instead recruit companions and establish a new settlement based on resource access and social dynamics; founding is not guaranteed.
4. All actions affect original population, supplies, friendship, fear and local reputation.
5. **Visible acceptance:** observer can follow one disappointed citizen leaving with belongings, living temporarily in a tent and either returning or founding a second camp. The system must explain why.

### MW-008 — Settlement diplomacy, trade and conflict
1. Every settlement has residents, claimed territory, buildings, real inventory, social institutions and a treasury.
2. Relationships between communities include friendly, neutral, indifferent, hostile and war. These are **states derived from events**, not hardcoded player commands.
3. Trade requires counterparties, an agreed price/barter, available physical goods, travel and final delivery. No teleportation of sold items.
4. Agreements, trust, betrayals, resource scarcity and killings affect future relations.
5. Conflict outcomes depend on resources, knowledge, casualties, location and ability to travel. Violence has actual medical, economic, familial and historical consequences.
6. **Visible acceptance:** two camps may choose to ignore each other, trade, cooperate or enter conflict based on diverging conditions. Logs show each causal step.

### MW-009 — Human lifecycle and mature society
Childhood, adulthood, parenthood, household formation, inheritance, health, death, family trees, culture and transgenerational memory. Mature adult themes can appear in relationships and emergent stories. Each person has a complete life card with truthfully recorded history; never fabricate facts to fill an empty biography.

### MW-010 — Environmental realism and physically sensible materials
Detailed biome and ecological systems, species-specific agriculture, wildlife, soil, water, wind, combustion and visual asset integration. Evaluate appropriate open libraries, e.g. Yuka/Recast for navigation, Rapier for rigid-body physics, and CC0 PBR sources such as Poly Haven/ambientCG. Verify individual asset licenses before import.

## Hosting plan for a single private player

**Now:** Vercel preview branches build the front-end for manual acceptance. They are *testing*, not a privacy guarantee.
**Later, on explicit approval:** run a separate authoritative simulation process in Docker on the existing VPS, keep mutable history in a private database, and reverse-proxy through Caddy with TLS, per-user authentication and access restrictions. Do not expose an unauthenticated save/replay/debug endpoint. Start from read-only inspection of VPS networking and capacity before any deployment.
**Offline choice:** maintain deterministic local simulation, optional local models, and avoid relying on third-party hosted dialogue tools for the adult-content game logic.

## Non-negotiable acceptance tests

- Physical item conservation across gathering, storage, crafting, building, trade and consumption.
- Material attributes have visible, measured consequences in the same simulation.
- Any NPC action is traceable to its needs, own knowledge, personality and real events.
- Social events are genuine two-party actions and cannot happen if one party is absent or unavailable.
- Adults and children are clearly distinct in any intimate relationship system.
- World events are retained in structured history and can be replayed from a reproducible seed.
- The simulation still runs unattended when the UI isn't rendering; VPS migration is required for continuous background operation.
- Visual and mobile-performance acceptance is separate from build and unit-test success.
