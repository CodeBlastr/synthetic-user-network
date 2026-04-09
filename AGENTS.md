# SUN AGENTS

## Repo Overview

SUN is a TypeScript + Playwright browser evaluation tool powered by Claude. The primary product is a dockerized HTTP server on `http://localhost:3020` that accepts a user prompt, creates an AI execution plan, runs Playwright evidence capture, and publishes a recommendation review page.

See `CLAUDE.md` for the full agent context document.

## Important Directories

- `src/mvp/` — core MVP: server, AI service (Claude), browser automation, store, HTML rendering
- `src/adapters/` — app-specific automation adapters (Chirpper adapter, legacy)
- `src/runners/` — legacy Chirpper smoke runners
- `artifacts/runs/` — generated JSON, screenshots, and run records
- `docs/` — architecture, rules, personas, and decisions

## How To Work In This Repo

- Read `CLAUDE.md` and `docs/RULES.md` before changing workflow or repository conventions.
- The primary product direction is the dockerized MVP on `localhost:3020`; smoke runners are secondary.
- Keep smoke flows deterministic, evidence-driven, and easy to diagnose from logs and artifacts.
- Prefer focused changes in adapters and runners over broad abstractions.
- When SUN is evaluating Chirpper, do not modify `../chirpper` merely to make a test pass. Record the blocker in artifacts first, and only change Chirpper in a separate improvement task.
- Treat `artifacts/runs/` as generated output unless the task explicitly asks to keep artifacts.
- If behavior, structure, or workflow changes, update the relevant docs in `docs/` and `CLAUDE.md`.

## Required Workflow For Every Implementation Task

1. Read `CLAUDE.md` and inspect the target files first.
2. Implement the change with focused edits.
3. Run `npm run typecheck` to verify TypeScript.
4. Update `docs/*.md`, `CLAUDE.md`, and `CHANGELOG.md` to reflect any structural changes.
5. Review the diff carefully, then commit and push.

## Verification Commands

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Run MVP: `npm run mvp`
- Default smoke path: `npm run smoke`
- Restored identity path: `npm run smoke:restored-identity`
- New visitor path: `npm run smoke:new-visitor`

## Done When

- TypeScript compiles cleanly.
- Relevant docs (`CLAUDE.md`, `docs/`) reflect workflow or behavior changes.
- `CHANGELOG.md` has an entry.
- Generated artifacts are either intentionally kept or left out of the commit.
- The diff is reviewed for accidental edits.
- The current branch is committed and pushed.

## Delegation Rule

For multiple independent investigations, broad codebase exploration, separate implementation chunks, or research-heavy work, explicitly use subagents. Keep the main thread focused on synthesis, tradeoffs, and final decisions.
