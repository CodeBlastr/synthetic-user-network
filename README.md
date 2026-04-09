# synthetic-user-network

SUN is a dockerized, prompt-driven recommendation tool for browser evaluation on `http://localhost:3020`.

You enter a prompt describing the browser test you want reviewed. SUN then:

1. Creates an AI-backed execution plan.
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

- `OPENAI_API_KEY`
- `OPENAI_MODEL` or the default `gpt-5-mini`
- `PORT` or the default `3020`

The MVP stores run artifacts under `artifacts/runs/` and exposes the review page from the same server.

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
