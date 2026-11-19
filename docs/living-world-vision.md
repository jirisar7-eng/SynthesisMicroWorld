# SYNTHESIS MicroWorld — Living World / God Simulation

**Status:** MW-004 prototype (2026-11-19). This is a project vision and implementation contract, not a claim that complete human behavior has been simulated.

## Core player fantasy
The player is a **god of conditions**, never an individual NPC's joystick. The player observes an autonomous society and indirectly changes what it must adapt to. The world develops whether or not the player issues commands.

1. **Everyone is an individual.** Needs, personality, experience and relationships differ.
2. **Every major event has a causal chain.** An NPC is hungry -> searches for food -> obtains or cannot obtain it -> morale or health changes.
3. **No fake conversations.** A meeting requires two actual agents physically approaching one location; both update relationships and record the encounter.
4. **Player interventions affect the world.** Weather, fertility, resources, terrain and disasters change the environment and therefore NPC incentives, rather than assigning an NPC a scripted action.
5. **Time and ecology matter.** A day has work, rest and changes in light; seasons and future generations will reshape the world in later milestones.
6. **Everything is observable.** Inspect an NPC's current goal and motivation, personal needs, important memories and strongest relationship, plus a world event log.

## Current MW-004 vertical slice

- Six individuals with numeric hunger, social need, energy and mood, and distinct curiosity / sociability / persistence traits.
- Local decision logic chooses whether to eat, rest, seek a voluntary two-person conversation, gather resources, construct a shelter or explore.
- Meals consume one actual food item from shared stores rather than relying on a global invisible daily deduction.
- Conversation requires both agents to arrive; social need and mood improve and an equal relationship score is stored on both sides.
- Personal experience text is recorded in a small bounded memory list. This is **not** deep long-term autobiographical recall yet.
- Curiosity influences exploration, persistence influences task duration, sociability controls urgency of meeting other people.
- Time-based sunlight and nighttime, character movement / work animation, visible rain.
- God interventions: rain increases berry regeneration and adds visible rain; abundance replenishes wild berries; drought lowers berry supply and daily replenishment. Each produces a world event and has a cooldown.
- Separate `/svet/` and `/prehled/` pages, with a running simulation maintained while navigating inside the app.

These systems are a first gameplay model, not scientifically validated psychology or human-level intelligence.

## Required longer-term simulation layers

### A. Individual biology and routine
Hunger, thirst, sleep, temperature, hygiene, illness, injury, aging and mortality. Tasks must take real time and use the individual's own resources, abilities, stamina and location. Food must come from production/gathering, water from available sources, and shelter must reduce exposure to weather.

### B. Perception and knowledge
Every agent perceives a limited area; resources, other citizens and dangers must be discovered. NPCs should not have omniscient access to the map. Past experience, maps, rumors and witnessing events should change each agent's knowledge.

### C. Psychology and practical decision-making
Utility scoring plus limited planning. Agent choices should consider urgency, probability of success, past outcomes, trait biases, safety, time of day, social obligations and the knowledge available to that particular NPC. Text language models can support selected narrative interactions later, but may not replace verifiable simulation state or causality.

### D. Real relationships and society
Reciprocal but potentially asymmetric trust, friendship, rivalry, cooperation, social roles, partnerships, families, parenthood, teaching, disagreement, leadership, culture and social norms. These must emerge from repeated interactions, not fixed cut-scenes. Social systems must affect real production and survival decisions.

### E. Ecology and economy
Water cycle, soil fertility, plant growth, wildlife, weather, seasons, nutrition, waste, construction materials, storage, paths made by foot traffic, transport, specialization and production chains. Resource flows must conserve quantities unless modified explicitly by a divine event.

### F. God-mode powers
- **Observation**: follow an agent, see motivations, relationships, migration and event history.
- **Gentle influence**: rain, sun, fertility, local plants, new natural resources.
- **Major interventions (later)**: storms, drought, floods, natural hazards, new habitats and altered terrain.
- **Experiment integrity**: every intervention is time-stamped in the world history. The simulation differentiates an NPC's own choice from the player's environmental input.

### G. Persistent history and generations
World seed, deterministic simulation ticks, save/restore, migration, births and deaths, evolving settlement architecture, a timeline and replayable cause-and-effect evidence. This is not implemented in the current prototype.

## Proposed next visible milestones

| Milestone | Observable result | Proof required |
| --- | --- | --- |
| MW-004 | NPCs eat, work, rest, meet, remember and react to godly weather/food influences | Unit tests and actual on-device observation |
| MW-005 | Agents know only what they perceive, discover resources and exchange knowledge | Inspectable knowledge maps per agent |
| MW-006 | Real home ownership, jobs, production and NPC-generated roads | NPC creates and uses infrastructure without player orders |
| MW-007 | Wildlife, water, seasons and food-chain pressure | Measurable weather and ecological causality |
| MW-008 | Family, trust, conflict and social institutions | Long-running multi-agent behavior audit |
| MW-009 | Generations, cultural evolution and save/replay | Same seed/timeline yields reproducible outcomes |
| MW-010 | Visual realism/character models, terrain materials and optimized graphics | Mobile 30 FPS target validated on real target devices |

## Acceptance gate for MW-004

- [ ] Unit tests pass in GitHub CI.
- [ ] Vercel Vite build READY.
- [ ] Mobile runtime: no JavaScript error, responsive 3D camera, separate page navigation.
- [ ] Watch a selected NPC become hungry, reach the camp and eat; shared food reduces exactly once.
- [ ] Watch two NPCs physically meet, talk and record reciprocal relationships.
- [ ] Trigger rain and visibly verify rainfall, environmental status and subsequent resource regeneration.
- [ ] Trigger drought and verify reduced resource stocks and delayed recovery.
- [ ] Verify pause and 1×/2×/4× still work.
- [ ] Validate performance on Android; large-world scalability not yet guaranteed.

**Release policy:** no merge or production promotion until these checks are confirmed. Current preview builds are evidence of compilation only, not real-life behavioral correctness.
