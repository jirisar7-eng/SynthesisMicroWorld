# MW-007 — Reálný prostor / Grounded World — implementační handoff

**Status: git implementace, CI acceptance; VPS deployment only after owner's explicit command.**
**Source:** `feature/mw-007-real-space`, branched off `deploy/vps-https-002`, HTTPS user authentication remains provided by existing Caddy.

## Implemented
- **MW-007A — Solid World:** `src/spatial-world.js`
  - Real 2D footprints for solid buildings, planned construction, tents, warehouse shelves, cargo piles, crates, baskets, seed trays, field beds, fire, planted trees and bushes, saplings, boulders and fallen logs.
  - Dynamic obstruction map from actual `MaterialWorld` containers/structures/project/tents; NPCs target walkable approach points, not object centers.
  - Bounded A* with continuous swept-segment/corner checking and one compact broad-phase spatial index per game update, not collision checks against the whole terrain for each step.
  - No teleportation on blocked movement. Route gets recalculated or NPC changes plan without walking through walls. Shared decisions, materials, NPC autobiographies, relationships and walking trails preserved.
  - Newly-built temporary tents reserve an obstruction footprint *before* placement. The builder arrives at the boundary, not inside future solid geometry; autonomous return journey tested.
  - New tent location must be a physically buildable free site near an explored location, with slope and clearance.
  - All terrain-solid visual props generated in Simulation, then visualized from exactly those coordinates; no scene-only boulders unseen by collision.
- **MW-007B — Grounded Props:** `src/terrain-contact.js`, `src/material-renderer.js`, `src/stockpile-layout.js`, `src/carry-poses.js`.
  - Small movable ground containers tilt gently to actual sampled surface; building, tent, field and shed foundations have realistic supports reaching the terrain.
  - Pallet log base raised precisely to contact board tops; crates store produce below wooden rim (first 16 pieces in one real layer); overflow and dropped goods go onto the soil instead of growing fruit towers.
  - Deliberately light GPU-instanced ground contact shadows for dropped/overflowed items rather than hundreds of shadow draw calls. Visible fabric carrying sling supports transported fruit instead of a bare floating stack.
  - Every item still has an individual ID and real material accounting.
- **MW-007C — Settlement:** `src/settlement-planner.js` rejects new construction footprints that overlap any physical scenery/structure and checks slope with existing terrain.

## What is NOT claimed
- Not a 3D rigid-body engine, not voxel editing, not photorealistic assets and not a fully simulated physics world.
- NPC-NPC bodies are not yet a pairwise avoidance system. Small grass, flowers and mushrooms remain pass-through scenery; solid trunk/boulder/log geometries block travel.
- Every individual berry is physically tracked and placed, but ground fruits do not yet model rolling, compression, friction or spoilage.

## CI and release gate
- Test suite includes spatial collision and swept collision, grid broad-phase parity, real A* movement, occupied target edge approach, dynamically appearing walls, camp site clearance, building ground contacts, crate overflow, temporary held food, dropped cargo shadows, and several-day autonomous world integration.
- `npm test` + `npm run build` and shell syntax check must PASS at the **exact branch commit**. Unsuccessful Vercel deployments caused by the free-tier limit do not block the independent VPS build.

## VPS update — staged; preserve the existing site and HTTPS
The previous release lives on `tatovacesta` at `microworld.tatovacesta.cz` and `127.0.0.1:18583`. Never merge into `main` or modify shared Caddy to deploy MW-007.

### Stage 1: stage clean independent Git worktree (MUTATING only local files)
Run as `uadmin` on VPS from an interactive shell. **Do not run `set -e` interactively, to avoid SSH logout.**
```bash
cd /home/uadmin/projects/SynthesisMicroWorld-HTTPS-002
git fetch origin \
  refs/heads/feature/mw-007-real-space:refs/remotes/origin/feature/mw-007-real-space
if [ -e "$HOME/projects/SynthesisMicroWorld-MW007" ]; then
  echo "STOP: target folder already exists"
else
  git worktree add --detach \
    "$HOME/projects/SynthesisMicroWorld-MW007" \
    refs/remotes/origin/feature/mw-007-real-space && \
  cd "$HOME/projects/SynthesisMicroWorld-MW007" && \
  git switch --no-track -c feature/mw-007-real-space && \
  git status --short && git log -1 --oneline
fi
```
This only checks out a new source tree; running Docker and Caddy are untouched.

### Stage 2: test and upgrade MicroWorld only (MUTATING)
After confirming GitHub CI PASS and the exact HEAD:
```bash
cd /home/uadmin/projects/SynthesisMicroWorld-MW007
bash deploy/vps/update-world.sh --apply
```
Build runs tests in Docker while old image stays online. Once the image exists, it replaces only the single MicroWorld web container, using **both** `compose.yaml` and `compose.https.yaml`. No Caddy reload, DNS changes, Mailcow, STT or other project restarts.

**Successful log marker:**
```text
MW007_UPGRADE_PASS sha=<exact_head> routes=3 game=200 protected=https-401
```
On failure, the script attempts rollback to the previous `local/microworld:<sha>` image using the existing HTTPS overlay. Verify actual rollback, do not assume success just from an attempted command.

### Stage 3: Android acceptance
- Open `https://microworld.tatovacesta.cz/svet/` in the **same** browser, authenticate as `owner`, and reload.
- Watch NPC carry food around the crate, pass beside the fire (never through it), navigate around houses/material yards, and use building-site boundaries.
- Verify fallen logs, overflow food, pallet logs and crates contact the ground (and never look like floating free sprites).
- Check `/prehled/` and `/lide/`; watch that harvesting, carrying and autonomous building continue for several game days.
- Compare with reference screenshot from 19.11.2026, especially floating fruit clusters, woodpile and construction site.
- Confirm original `www.tatovacesta.cz`, Mailcow and STT remain available.

### Acceptance criteria
- No crossing solid building, crate, pallet, fire, rock, tree, tent or field collision footprints.
- No reachable-target teleportation; reachable NPC routes use continuous movement and physically valid outer approach.
- Food and logs sit on container surfaces or soil, not in unconstrained stacks in air.
- Population autonomy and physical accounting retained.
- CPU/mobile FPS not significantly regressed; measure on Android after deploy.

## Rollback / safety
Actual VPS deployment is an explicit **owner-run** step, not performed by this GitHub branch. HTTPS password never enters Git/Notion. Keep previous Docker image for rollback and do not use `docker compose down -v`, global `prune`, or change the shared proxy because of this feature.
