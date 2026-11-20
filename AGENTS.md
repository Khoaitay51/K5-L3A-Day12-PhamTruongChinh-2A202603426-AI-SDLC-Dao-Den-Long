# AGENTS.md — Đảo Đèn Lồng

## Commands
- Install & build: `npm install --no-audit --no-fund && npm run build`
- Run 3D game: `npm run start`
- Run unit & contract tests: `npm test`
- Run headless simulation: `node src/cli/headless.js --seed 1 --night <1|2|3> --ticks 600 --out /tmp/out.jsonl`

## Architecture Rules
- `src/core/` MUST remain pure ESM JavaScript with zero DOM, WebGL, or `three` imports.
- Fixed timestep: 60 ticks/sec (`DT = 1/60`). All randomness MUST use `src/core/rng.js` (`mulberry32`).
- Map geometry, ground height, cliffs, ramps, bridge, tower collision, and jump pads live in `src/core/maps.js`.
- Follow the exact TICKET-02 12-step tick order in `src/core/sim.js`. Shade states must be one of: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Creative additions in `src/render/` MUST NOT alter headless simulation output.

## Verification Gate
- Run `npm test` (including Phase 1 regression + Phase 2 headless scenarios) and `npm run build` before committing or tagging.
- Verify a full 21,600-tick Night 3 headless run finishes well under 30 seconds.
