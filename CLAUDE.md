# CLAUDE.md — SUN Agent Context

This file is the canonical context document for AI agents (including Claude Code) working in this repository. Read this before making any changes.

---

## What This Repo Is

**SUN (Synthetic User Network)** is a dockerized, prompt-driven browser evaluation tool. It runs on `http://localhost:3020` and produces a single recommendation page per run.

**Primary user flow:**
1. User enters a browser-test prompt at `http://localhost:3020`
2. Claude generates an execution plan (3–6 steps)
3. User approves the plan
4. SUN runs Playwright browser automation, capturing screenshots at each step
5. Live screenshot previews and events stream to the UI during execution
6. SUN produces a `/reviews/<run-id>` page with one recommendation, reasoning, screenshots, and a copy-paste AI prompt

---

## Hard Rules (from docs/RULES.md)

- `docs/ARCHITECTURE.md` must stay current — update it whenever the structure changes.
- `docs/RULES.md` contains hard LLM rules; always follow them.
- `docs/DECISIONS.md` (append-only) records major decisions.
- `docs/IDEAS.md` tracks ideas not yet fully explored; remove entries once resolved.
- The **primary SUN direction** is the dockerized MVP on `localhost:3020`. Legacy smoke runners are secondary.
- **No backwards compatibility required** when implementing or changing features.
- Always update `CHANGELOG.md` and all `docs/*.md` files before committing.
- Always commit and push with a detailed message after every task.
- When SUN evaluates Chirpper: **do not modify Chirpper to make a test pass**. Record the blocker in artifacts first; treat any Chirpper fix as a separate task.
- If a plan deviates from software engineering best practices, call it out and ask for human confirmation.

---

## Repository Structure

```
src/mvp/
  server.ts     — HTTP server (port 3020), API routes, SSE, artifact serving
  ai.ts         — Claude API integration: planner, action decisions, run analysis
  browser.ts    — Playwright automation: screenshot capture, action execution
  store.ts      — File-based run state + SSE event hub
  html.ts       — Home page and review page HTML rendering
  types.ts      — All shared TypeScript interfaces

src/adapters/
  chirpper.ts   — Browser automation adapter for Chirpper (legacy)

src/runners/
  smoke.ts              — Legacy Chirpper smoke runner
  multi-user-lineage.ts — Legacy multi-user lineage runner

docs/           — Architecture, rules, personas, decisions
artifacts/runs/ — Generated run output (JSON, screenshots) — treat as generated
```

---

## AI Provider

SUN uses the **Anthropic Claude API** (`https://api.anthropic.com/v1/messages`).

Required env vars:
- `CLAUDE_API_KEY` — Anthropic API key (required)
- `CLAUDE_MODEL` — defaults to `claude-sonnet-4-6`
- `CLAUDE_MAX_ATTEMPTS` — retry attempts for 429/529, defaults to `2`

The AI service (`src/mvp/ai.ts`) handles three tasks:
1. `createPlan(userPrompt)` → structured `ExecutionPlan`
2. `decideNextAction(input)` → next browser action given screenshot + page snapshot
3. `analyzeRun(input)` → final `RunAnalysis` with one recommendation

---

## Other Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3020` | HTTP server port |
| `HEADLESS` | `true` | Playwright headless mode |
| `SUN_ALLOWED_HOSTS` | `chirpper.com,...` | Allowed navigation hosts |
| `SUN_MAX_EXECUTION_STEPS` | `8` | Max browser steps per run |
| `SUN_TIMEOUT_MS` | `15000` | Per-action timeout (ms) |

---

## Running SUN

**Docker (preferred):**
```bash
docker compose up --build
```

**Host (development):**
```bash
npm run mvp
```

**Type check:**
```bash
npm run typecheck
```

---

## Key API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Home page with prompt input |
| `POST` | `/api/plans` | Create execution plan from prompt |
| `POST` | `/api/runs/:id/execute` | Start approved run |
| `GET` | `/api/runs/:id` | Fetch run state |
| `GET` | `/api/runs/:id/events` | SSE stream of live events |
| `GET` | `/reviews/:id` | Completed run review page |
| `GET` | `/artifacts/:path` | Serve screenshots |
| `GET` | `/api/health` | Health check |

---

## Data Persistence

Each run lives in `artifacts/runs/<uuid>/`:
- `run.json` — full run record (status, plan, screenshots, analysis, events)
- `*.png` — screenshot files

---

## SUN Personas (from docs/SUN.md)

| Persona | Post Freq | Comment Quality | Abuse Prob |
|---|---|---|---|
| High Quality Builder | medium | high | 0 |
| Casual User | low | medium | 0.05 |
| Bad Actor | high | low | 0.40 |

---

## Testing Boundary

- SUN is **recommendation-first**: stop after collecting enough evidence for one concrete recommendation.
- Surface provider errors (rate limits, auth) clearly to the operator in the UI.
- Do not modify Chirpper to make a SUN test pass.
- If a SUN run exposes a Chirpper blocker, record it in `artifacts/` first.

---

## Done Criteria for Any Task

1. TypeScript compiles (`npm run typecheck`)
2. All updated `docs/*.md` files reflect changes
3. `CHANGELOG.md` has an entry
4. Diff is reviewed for accidental edits
5. Branch is committed and pushed

Last Updated: 2026-04-09
