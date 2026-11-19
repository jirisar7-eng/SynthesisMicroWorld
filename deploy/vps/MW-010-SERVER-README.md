# MW-010 — Persistent headless world, isolated VPS preview

**Never conflate this with the existing 3D website.** This is a second simulation service with separate storage and a local-only read-only API. The existing protected 3D pages remain browser-local until a later authenticated synchronization protocol is implemented and accepted.

## Scope
- One headless `Civilization` instance, same pure simulation kernel as browser, no Three.js/WebGL in the Node process.
- Real independent founder scenario (30 people), deterministic per-world seed for the main NPC choice loop, independent year/health/family chronology.
- Clock ticks while the Node process is active; read-only `/healthz`, `/api/status`, `/api/events`.
- Atomic snapshots every 60 s and on graceful SIGINT/SIGTERM. On restart, restore from versioned file. Corrupt save **blocks startup** to prevent silent overwrite.
- HTTP listener is bound by Docker to **127.0.0.1:18584 only**, never to public 0.0.0.0. No shared Caddy reload, no DNS changes and no Mailcow or STT touch.
- Separate named volume `microworld_sim_private_microworld-sim-state`. Do not use `down -v` or global prune.

## Acceptance gate before any VPS mutation

1. The **exact feature branch commit** must pass tests, Vite build, and Docker smoke. User must read the results; no auto-merge to main.
2. On VPS, read-only: `hostname -s` must be `tatovacesta`; `docker ps` and `docker compose -f deploy/vps/server.compose.yaml config`; verify `ss -lnt` has no owner of port 18584.
3. The feature can be staged in its own Git worktree. **Never run `set -e` interactively**: a failed shell assertion would close Termux SSH.
4. Build only the isolated server service: `docker compose -f deploy/vps/server.compose.yaml build sim`.
5. Launch only the new service: `docker compose -f deploy/vps/server.compose.yaml up -d --no-deps sim`.
6. Inspect `docker compose -f deploy/vps/server.compose.yaml ps`, `curl -fsS http://127.0.0.1:18584/healthz` and `curl -fsS http://127.0.0.1:18584/api/status`. Verify 30 real living people and advancing simulated seconds.
7. Wait through one automatic snapshot, restart **only sim**, verify `restored:true` and day/seconds do not reset. Verify public 3D site and unrelated services have not changed.
8. For rollback/stop: `docker compose -f deploy/vps/server.compose.yaml stop sim` leaves volume intact; the original 3D game was never changed.

## Important limitations

- No current automatic sync to the public browser site.
- No multiple real-time user control or concurrent writes.
- The scenario still has a simplified ecology/demographic engine; full politics, cultural inheritance, scientific discovery and animal trophic webs remain backlog.
- Clock advance is bounded after process suspension to avoid uncontrolled jumps.
- Never expose read-only citizen data publicly until auth and privacy review.
