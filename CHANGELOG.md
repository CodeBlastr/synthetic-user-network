# Changelog

## Unreleased

- Documented SUN as a dockerized prompt-driven recommendation tool on `http://localhost:3020`.
- Added a clear MVP flow for prompt intake, AI plan approval, Playwright evidence capture, streamed previews, and the review page handoff.
- Marked the existing Chirpper smoke runners as legacy or secondary workflows in the repo documentation.
- Improved OpenAI failure handling so `429` responses now preserve the provider message, distinguish likely quota exhaustion from transient throttling, and retry short-lived rate limits once by default.
