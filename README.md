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
