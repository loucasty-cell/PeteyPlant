# Petey Plant

Petey helps busy people remember when to check the houseplants they already own. Show the next useful action first. Keep the botanical companion and its care history together.

## Project conventions

- Vite, React, TypeScript and local CSS for the garden UI. FastAPI and SQLite own plant and care records. Keep the experimental biophysics demo in Plant Lab and label its synthetic data.
- Species records, individual plants, observations and projected checks are distinct. Show the source for verified care guidance. Label projections and default check dates as estimates. Never fabricate a measurement or turn missing evidence into a watering instruction.
- Follow the warm greenhouse visual reference. Keep text available for all care states. Verify keyboard access, focus, feedback, mobile reflow and reduced motion. Reuse installed dependencies.
- Keep original art files intact. Record the status of concept art, editable Blender source, real-time assets and tested animation separately.
- Preserve existing work. Verify the relevant normal entry points and their failure paths. Never claim an unrun test, publish, push or delete important data without authorization. Keep credentials and local databases out of Git.

## Commands

- Backend from `backend`: `python -m uvicorn main:app --port 8000` and `python -m pytest -q`.
- Frontend from `frontend`: `npm ci`, `npm run dev`, `npm run build`, and `npm run verify:contrast`.
- Garden journey with both services running and Playwright Chromium installed: `node verification/garden.mjs`. An installed Edge browser can be selected with `PETEY_BROWSER_CHANNEL=msedge` in the environment.
- Update [PLANS.md](PLANS.md) with actual evidence and unresolved work. A successful compile alone is insufficient for UI completion.
