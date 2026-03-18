# SUN AGENTS

## Repo Overview

SUN is a TypeScript + Playwright synthetic-user test harness. Right now it is focused on browser-driven Chirpper smoke coverage, structured run artifacts, and reusable adapter logic.

## Important Directories

- `src/adapters/`: app-specific automation adapters such as the Chirpper adapter
- `src/runners/`: executable runners such as the smoke runner
- `artifacts/runs/`: generated JSON, markdown, and screenshot output from runs
- `docs/`: repo rules and SUN-specific notes

## How To Work In This Repo

- Read `docs/RULES.md` before changing workflow or repository conventions.
- Keep smoke flows deterministic, evidence-driven, and easy to diagnose from logs and artifacts.
- Prefer focused changes in adapters and runners over broad abstractions.
- Treat `artifacts/runs/` as generated output unless the task explicitly asks to keep artifacts.
- If behavior, structure, or workflow changes, update the relevant docs in `docs/`.

## Required Workflow For Every Implementation Task

1. Inspect the target runner, adapter, docs, and package scripts first.
2. Use `../agents/plan-task/SKILL.md` for broad, risky, ambiguous, or research-heavy work.
3. Use `../agents/execute-task/SKILL.md` for normal implementation.
4. Reproduce or run the closest smoke path when changing automation behavior.
5. Keep logs, failures, and artifacts clear enough to support debugging.
6. Review the diff carefully, then commit and push the current branch.

## Verification Commands

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Default smoke path: `npm run smoke`
- Restored identity path: `npm run smoke:restored-identity`
- New visitor path: `npm run smoke:new-visitor`

## Done When

- The targeted smoke path or typecheck passes for the changed area.
- Relevant docs reflect workflow or behavior changes.
- Generated artifacts are either intentionally kept or left out of the commit.
- The diff is reviewed for accidental edits.
- The current branch is committed and pushed.

## Shared Skills

- Planning: `../agents/plan-task/SKILL.md`
- Execution: `../agents/execute-task/SKILL.md`
- Debugging: `../agents/bug-hunt/SKILL.md`

## Delegation Rule

For multiple independent investigations, broad codebase exploration, separate implementation chunks, or research-heavy work, explicitly use subagents. Keep the main thread focused on synthesis, tradeoffs, and final decisions.
