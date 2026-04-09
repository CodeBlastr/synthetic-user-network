# Changelog

## Unreleased

- Migrated AI provider from OpenAI to Anthropic Claude (`claude-sonnet-4-6` default).
- Replaced `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_MAX_ATTEMPTS` env vars with `CLAUDE_API_KEY` / `CLAUDE_MODEL` / `CLAUDE_MAX_ATTEMPTS` throughout `ai.ts`, `docker-compose.yml`, `.env.example`, `docs/ARCHITECTURE.md`, and `README.md`.
- Updated `src/mvp/ai.ts` to call the Anthropic Messages API (`https://api.anthropic.com/v1/messages`) with proper `x-api-key` and `anthropic-version` headers; image data URLs are now decoded to base64 for Claude's image input format.
- Added retry coverage for HTTP `529` (Claude overload) in addition to `429` rate limits.
- Created `CLAUDE.md` as the canonical agent-context file for this repo, synthesized from the `docs/` folder.
- Updated `AGENTS.md` to reflect the MVP-first direction and Claude as the AI provider.

## Previous

- Documented SUN as a dockerized prompt-driven recommendation tool on `http://localhost:3020`.
- Added a clear MVP flow for prompt intake, AI plan approval, Playwright evidence capture, streamed previews, and the review page handoff.
- Marked the existing Chirpper smoke runners as legacy or secondary workflows in the repo documentation.
- Improved AI failure handling so `429` responses now preserve the provider message, distinguish likely quota exhaustion from transient throttling, and retry short-lived rate limits once by default.
