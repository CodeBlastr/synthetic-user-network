# SUN Architecture

## Product Shape

SUN is a Docker-first browser evaluation MVP that listens on `http://localhost:3020`. The primary user flow is prompt-driven:

1. The user writes a browser-test prompt.
2. SUN creates an AI-backed execution plan.
3. The user approves the plan.
4. SUN runs a Playwright browser capture.
5. SUN streams execution events and screenshot previews while the run is in progress.
6. SUN publishes a review page with one recommendation, supporting reasoning, screenshots, and copy-paste Codex markdown.

## Runtime Pieces

- `src/mvp/server.ts` serves the MVP HTTP API, SSE event stream, artifact files, and review pages.
- `src/mvp/ai.ts` handles the planner, browser-action decisions, and final recommendation analysis.
- `src/mvp/browser.ts` runs the Playwright session, captures screenshots, and records the action trail.
- `src/mvp/store.ts` persists run state and event history under `artifacts/runs/`.
- `src/mvp/html.ts` renders the prompt entry page and the recommendation review page.

## Data Flow

The MVP stores each run as a directory under `artifacts/runs/<run-id>/`.

- `run.json` contains the persisted run record.
- Screenshot files are written alongside the run record.
- The browser UI streams live updates over `GET /api/runs/<run-id>/events`.
- The completed run is published at `GET /reviews/<run-id>`.

The review page is the main product output. It is intended to be copied into Codex as implementation guidance.

## Environment

Primary environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PORT` with a default of `3020`
- `SUN_ALLOWED_HOSTS`
- `SUN_MAX_EXECUTION_STEPS`
- `SUN_TIMEOUT_MS`
- `HEADLESS`

The Docker path is the preferred way to run the MVP. The host command remains available for local development.

## Secondary Workflows

The Chirpper smoke runners in `src/runners/` remain in the repo for secondary validation and legacy coverage.

- `npm run smoke`
- `npm run smoke:restored-identity`
- `npm run smoke:new-visitor`
- `npm run smoke:multi-user-lineage`

Those flows are still useful for diagnosing Chirpper behavior, but they are not the main SUN product direction.
