# SYNTHESIS MicroWorld

**Autonomous civilization simulation.** Player is primarily an observer; NPCs decide where to go, what to gather, when to rest, and when to build.

## MW-001 — First Life (experimental)

This is the first interactive playable preview, not the finished 1.0 game.

- Stylized 3D island with forests, berries, shore, rocks, sky and a central camp.
- Six autonomous agents with individual positions, energy, movement, tasks, reasoning and resource collection.
- Shared wood/food economy: gathering trips have to physically return to camp to deliver resources.
- First shelter is constructed only after the agents themselves collect enough wood.
- Observer HUD with real-time event history, selected NPC's current task and motivation.
- Camera orbit / zoom / pan, pause, 1×/2×/4× speed, and indirect cooperation/nature policy sliders.
- Mobile-responsive interface; no direct construction commands.

## Pages in MW-002

- **`/svet/` — full-screen 3D world:** separate immersive view with camera controls, compact population/food/wood HUD and the currently observed NPC.
- **`/prehled/` — autonomous simulation overview:** building progress, event log, resource totals, NPC reasoning and indirect influence settings.
- Both addresses are backed by the same client-side simulation. Switching between pages through the navigation **does not reset the running world**. Reloading currently starts a new experiment; saving is planned for a later milestone.
- Vercel rewrites support opening either route directly and browser back/forward navigation.

The environment features multiple conifer and broadleaf tree shapes, saplings, meadow flower patches, dense grass, forest shrubs, mushrooms, fallen wood, varied stones, reeds and cattails on the coast, and animated butterflies. Large ground-cover populations are drawn with GPU instancing to minimize draw calls.

**Acceptance still required:** verify the full-screen layout and touch controls on Android, inspect frame rate, ensure both direct URLs load, and confirm the world continues after switching views. Successful builds alone do not establish visual or functional acceptance.

## MW-005 — Individual perception, personal knowledge and learning

**New Preview milestone:** an agent no longer chooses food or wood by reading the omniscient list of available resources. Decisions use only known sightings and dated reports from other NPCs.

- Each individual has an independent knowledge ledger, explored-cell history, recent decisions, and cause/outcome episodes.
- Nearby trees and berries become known only when within an **approximate 7.5-world-unit observation radius**. This is simplified proximity perception, not line-of-sight vision.
- Unknown resources cannot be used as navigation targets. NPCs without a usable remembered source select a target in an unvisited part of their surroundings, physically travel there, and may discover new resources.
- Two NPCs may exchange up to three memorized resource locations after they have physically met and talked. Recipients see a **hearsay** source; the original observer remains the only owner of direct evidence.
- Reports retain the original observation timestamp: hearing an old report does not refresh the original inventory. New direct observations override reports. A depleted source is temporarily avoided after a failed visit.
- The observer overview shows a **personal fog-of-knowledge map**, explored patches, direct sightings (green/cyan), hearsay (amber), the last decision's reason, and up to four recent explainable experience records. Player god powers continue to change environmental conditions without issuing NPC commands.
- Automated Node tests cover individual-only discovery, sharing provenance, stale information, failure-driven avoidance, exploration without access to hidden resources, and bounded episodic history.

**Known limitations:** no spatial occlusion, hearing distance, real conversational language, sensory uncertainty other than report provenance, persistent savegames, fully deterministic simulation, causal event graph, or long-term reasoning model. The personal map is a 2D inspection visualization and does not conceal the god's 3D overview of the world. The existing limited six-agent simulation still cannot autonomously create a multi-generation town.

**Acceptance:** GitHub CI and Vercel build verify syntax, modules and pure logic. Run-time rendering, spatial learning progression, NPC survival and performance on target Android devices require explicit acceptance separately. Production and `main` are unchanged.

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

Stack: Vite 6 + Three.js 0.174 + JavaScript. Static app; no API keys or server dependencies.

## Current acceptance target

1. **World** — WebGL canvas shows a traversable 3D island and camera controls work.
2. **Autonomous movement** — Agents choose and walk to resource locations without player orders.
3. **Real collection** — Agents gather and physically return to camp, increasing shared stocks.
4. **First construction** — When wood reaches 12, one agent independently begins and completes a shelter.

Build passing is only build verification. Visual rendering, touch controls and agent behavior need live acceptance on real Android devices before marking MW-001 PASS.

## Known limitations

- This is an early prototype, with intentionally simplified movement (no obstacle-aware pathfinding), no saved worlds, no long-term population dynamics, and only one autonomous shelter.
- Agent AI is local utility-based logic rather than an LLM. It is autonomous at this scope; agents have no language-model inference or human-like general reasoning.
- The world is in-memory; restarting the browser starts a new experiment.
- No automated browser tests or mobile FPS acceptance yet. Rendering performance is not verified.
- Vite emits a large-chunk warning for Three.js; this should be optimized in a later step.

## Roadmap

Seven four-step batches: first life → autonomous work → self-directed building → community → civilization growth → observer influence → v1.0 acceptance.

Deployment target: Vercel connected to `jirisar7-eng/SynthesisMicroWorld`. Development branch: `feature/mw-001-first-life`. Production release requires explicit acceptance.
