# Petey Plant

Petey helps busy people remember when to check the houseplants they already own. Show the next useful action first. Keep the botanical companion and its care history together.

## Project conventions

- Vite, React, TypeScript and local CSS for the garden UI. FastAPI and SQLite own plant and care records. Keep the experimental biophysics demo in Plant Lab and label its synthetic data.
- Species records, individual plants, observations and projected checks are distinct. Show the source for verified care guidance. Label projections and default check dates as estimates. Never fabricate a measurement or turn missing evidence into a watering instruction.
- Follow the warm greenhouse visual reference. Keep text available for all care states. Verify keyboard access, focus, feedback, mobile reflow and reduced motion. Reuse installed dependencies.
- Keep original art files intact. Record the status of concept art, editable Blender source, real-time assets and tested animation separately. Save every editable Blender companion in `assets/characters/<asset-id>/source/` and add it to the [shared model index](assets/characters/README.md).
- Preserve existing work. Verify the relevant normal entry points and their failure paths. Never claim an unrun test, publish, push or delete important data without authorization. Keep credentials and local databases out of Git.

## Working on a change

- Start with the [verification map](docs/connect/ENGINEERING_INTEGRITY.md#journey-and-release-verification) for the affected user journey and the [current handoff](ANTIGRAVITY_HANDOFF.md) for its open work and evidence. Confirm the relevant behavior on the current checkout.
- Follow the [engineering improvement playbook](docs/connect/SELF_IMPROVEMENT.md). Keep decisions at their existing source of truth. Reproduce failures before fixing them, and turn recurring mistakes into a targeted check or a constraint in the code.
- When delegating, give each agent the relevant repo instructions, work package, file scope, and acceptance checks. Integration owns shared contracts and runs the affected journey after combining changes.
- Record the revision, commands, results, and remaining evidence in [PLANS.md](PLANS.md) for completed work packages. Update the verification map when a journey or check changes, and the handoff when the next action or release status changes.

## Commands

- Backend from `backend`: `python -m uvicorn main:app --port 8000` and `python -m pytest -q`.
- Frontend from `frontend`: `npm ci`, `npm run dev`, `npm test`, `npm run build`, and `npm run verify:contrast`.
- Garden journey with both services running and Playwright Chromium installed: `node verification/garden.mjs`. An installed Edge browser can be selected with `PETEY_BROWSER_CHANNEL=msedge` in the environment.
- Update [PLANS.md](PLANS.md) with actual evidence and unresolved work. A successful compile alone is insufficient for UI completion.
