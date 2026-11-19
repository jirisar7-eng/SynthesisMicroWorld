# MW-006D — Carrying, terrain, Poly Haven API
**Status: Preview / not production.** Current head is `feature/mw-006d-carry-terrain-assets`.

## Defect reproduced from user screenshot
Previously the renderer displayed inventory objects at `x=agent.x`, `z=agent.z` and `y=terrainHeight + offset`, independently of the person's rotation and frame-by-frame character animation. A 350 ms inventory refresh made the mismatch especially visible. This was *not* physical carrying, just terrain-relative hovering.

## Implemented

### Real attachment to NPC
- Every carried item is still a distinct tracked item with its own ID.
- A dedicated `cargoAnchor` is a child of the actual moving 3D NPC model. All carried meshes are reparented under that anchor.
- Logs and twigs orient horizontally across the upper body; stone stays held near the chest; fruits and berries are physically grouped in the arms with a clothing fold underneath instead of a magically created basket.
- Arm pose changes with load type. Heavy cargo causes a movement speed penalty.
- On delivery an item is reparented from the NPC to the fixed world scene, using its genuine storage layout.
- On removal/consumption the renderer removes the mesh from whichever parent it currently has, preventing ghost objects.
- Interrupted haul creates a ground pile at the actual person's position; a later citizen can recover it. No item disappears merely because the task was interrupted.

### Terrain
- Added mixed-scale relief and more detailed vertex coloration while preserving smoother ground near the campsite.
- Removed the unnatural raised, solid-color beige disc around the fire.
- Created a soft irregular trampled-soil region, patches of forest floor conforming to the actual slope and inexpensive instanced dead leaves.
- Existing traffic-made footpaths continue to be layered above the physical ground.

### External API is actually integrated
- Build script `scripts/sync-polyhaven-terrain.mjs` calls the official **Poly Haven Public API** at `https://api.polyhaven.com/files/forrest_ground_01` using a project-specific User-Agent.
- The file URL is taken from the API response, not invented; only allowlisted HTTPS Poly Haven CDN hosts are accepted.
- Downloads a reasonably small 1K diffuse map into the build's static `public/terrain/` directory, emitting `manifest.json`. The image is served from the game's own deployment, so gameplay does not depend on a third-party API.
- Both build and client have a fallback: on network/API/size/load failure, the procedural local forest surface remains visible.
- Poly Haven asset [Forest Ground 01](https://polyhaven.com/a/forrest_ground_01) is CC0. Asset-provider credit is visible in the help dialog.
- Vercel build logs have independently shown a successful **1K JPG / 814 KiB** download for the working branch before final review.

## Automated acceptance
- [ ] Unit tests for local carrying pose and API URL validation
- [ ] Three.js scene-graph attachment test: an item follows NPC translation and rotation without any inventory refresh
- [ ] Delivery test: item returns from avatar hierarchy to static world scene
- [ ] Interruption/drop-and-recovery conserves ID and stock quantities
- [ ] Full prior autonomous-life and economy suites pass
- [ ] Vercel build READY on the latest commit
- [ ] Actual Android WebGL visual confirmation and FPS test

## Important remaining work
Character models/animations are still deliberately simple. Load rig is not yet skeletal IK or collision-based rigid-body physics; physical hand support is an explicit approximation. Global pathfinding, local drop recovery and carrying capacity will require further balancing when population grows. Terrain shading is richer, but is not full photorealism and is designed to remain viable on mobile.

**Release policy:** No changes to main, production or VPS without separate approval.
