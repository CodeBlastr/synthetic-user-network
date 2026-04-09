# synthetic-user-network

SUN is a dockerized, prompt-driven recommendation tool for browser evaluation on `http://localhost:3020`.

You enter a prompt describing the browser test you want reviewed. SUN then:

1. Creates an AI-backed execution plan (powered by Claude).
2. Waits for you to approve the plan.
3. Runs a Playwright evidence capture.
4. Streams screenshot previews and execution events while the run is active.
5. Publishes a review page with one recommendation, the reasoning, screenshots, and copy-paste Codex markdown.

## Primary MVP

Run the MVP in Docker:

```bash
docker compose up --build
```

Then open `http://localhost:3020`, paste a prompt, generate a plan, approve it, and review the resulting page under `/reviews/<run-id>`.

If you prefer to run it directly on the host, use:

```bash
npm run mvp
```

Required environment:

- `CLAUDE_API_KEY` — your Anthropic API key
- `CLAUDE_MODEL` — defaults to `claude-sonnet-4-6`
- `CLAUDE_MAX_ATTEMPTS` — defaults to `2`
- `PORT` — defaults to `3020`

Copy `.env.example` to `.env` and fill in your `CLAUDE_API_KEY` before starting.

The MVP stores run artifacts under `artifacts/runs/` and exposes the review page from the same server.
If Claude rejects a request, SUN surfaces the provider message directly so rate-limit and auth problems are easy to diagnose from the browser UI.

## Legacy Smoke Runs

The existing Chirpper smoke runners remain available as secondary workflows for targeted verification and historical coverage. They are not the primary product story anymore.

Available scripts:

```bash
npm run smoke
npm run smoke:restored-identity
npm run smoke:new-visitor
npm run smoke:multi-user-lineage
```

Those runners still write structured JSON, markdown, and screenshots into `artifacts/runs/`.
