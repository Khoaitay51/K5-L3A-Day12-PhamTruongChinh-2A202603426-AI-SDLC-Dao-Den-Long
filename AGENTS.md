# AGENTS.md — Đảo Đèn Lồng

## Commands
- Install & build: `npm install --no-audit --no-fund && npm run build`
- Run 3D game: `npm run start`
- Run unit & contract tests: `npm test`
- Run headless simulation: `node src/cli/headless.js --seed 1 --night 1 --ticks 600 --out /tmp/out.jsonl`

## Architecture Rules
- `src/core/` MUST remain pure ESM JavaScript with zero DOM, WebGL, or `three` imports so headless simulation runs fast in Node.js.
- Fixed timestep: 60 ticks/sec (`DT = 1/60`). All simulation randomness MUST use `src/core/rng.js` (`mulberry32`).
- Coordinate convention: Y-up, ground at Y = 0, distances in `game.contract.json` measured on XZ plane unless stated otherwise, coordinates rounded to 3 decimals in JSONL output.
- Creative additions (`src/render/` or optional visual effects) MUST NOT alter headless simulation output.

## Verification Gate
- Never finish a phase or commit without running `npm test` and `npm run build`, and recording real command output in `docs/proof/phase-<N>.md`.
