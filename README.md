# synthetic-user-network

An autonomous network of users for testing real world usage of your application.

## Chirpper Smoke Test

SUN now includes a first browser-driven smoke path for a local Chirpper instance.

1. Start Chirpper locally on `http://localhost:3000`.
2. From `sun/`, install dependencies with `npm install`.
3. Run `npm run smoke`.

The smoke runner will:

- call `GET /api/health`
- open the Chirpper homepage
- mint a fresh local root invite for setup
- open the invite page in a browser
- claim the invite with `Save invite for later`
- verify the redirect to `/token`
- print structured JSON logs for each step

Notes:

- If Chirpper is running in Docker on `localhost:3000`, SUN auto-detects the container and creates the invite inside that container so the app sees the same D1 state it is serving.
- The current local Chirpper setup does not expose `CHIRPPER_SESSION_SECRET`, so the smoke path restores a valid token into browser `localStorage` first and then verifies the real invite-claim-to-wallet flow through the UI.

## Multi-User Trust Graph Smoke

SUN also includes a real three-identity lineage journey for local Chirpper:

1. Token A claims an invite and publishes a post.
2. A's post earns reward invites through real vote activity.
3. A reveals one wallet invite for Token B.
4. Token B claims that invite, publishes a post, and then reveals a child invite for Token C.
5. Token C claims the invite and persists identity.
6. Token B comments on A's post.
7. Token C upvotes B's comment.

Run it with:

```bash
npm run smoke:multi-user-lineage
```

Artifacts are written under `artifacts/runs/` as JSON, markdown, and screenshots. The lineage artifact records:

- `lineage_established`
- `multi_user_flow_completed`
- `trust_graph_signal_observed`
- `identities_involved`
- `invite_edges_completed`
- `content_objects_created`
- `interactions_completed`
