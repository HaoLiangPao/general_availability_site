# CLAUDE.md

This file defines how coding agents (Claude Code, Codex, and similar) should work in this repository.

## 1. Product Context

This project is a booking system where:
- Host availability is synchronized with Google Calendar (and optionally Outlook ICS).
- External users book time with the host (interview, coffee chat, in-person, ski lesson).
- Booking correctness and no-conflict guarantees are critical.
- Notifications between host and guest are part of core behavior.

Top technical priority:
- Prevent double booking under concurrent requests (true atomicity, not only pre-checks).

## 2. Non-Negotiable Engineering Principles

1. Correctness over speed.
2. Every production behavior change must be test-backed.
3. No direct commits to `main`.
4. No silent schema/API changes.
5. If introducing a new technology or API, document decision rationale and alternatives in `Design-log.md` before merge.

## 3. Required Workflow For Any Change

1. Understand current behavior:
- Read affected route(s), lib(s), and scripts.
- Identify existing tests and coverage gaps.

2. Write/adjust tests first (or at minimum in the same change set):
- Reproduce bug/failure path.
- Add expected-path and edge-case tests.

3. Implement minimal safe change:
- Keep diffs focused.
- Avoid broad refactors unless required for safety/correctness.

4. Validate locally:
- Typecheck
- Build
- Relevant test suite(s)

5. Update docs:
- `Design-log.md` entry updated with commit hash.
- If a new technology/API is introduced, include a `Technologies` decision section (template below).

6. Commit on a non-main branch with clear message.

## 4. Version Control Rules

- Branch naming:
  - `feat/<short-topic>`
  - `fix/<short-topic>`
  - `chore/<short-topic>`
  - `review/<short-topic>`

- Commit rules:
  - One logical concern per commit.
  - Commit messages use imperative mood.
  - Include migration + code + tests in same commit when tightly coupled.

- Forbidden:
  - Direct push to `main`.
  - Force push shared branches unless explicitly coordinated.
  - Mixing unrelated changes in one commit.

- Before opening PR:
  - Rebase on latest `main`.
  - Resolve conflicts cleanly.
  - Re-run validation checks.

## 5. Test-Driven Development Standard

For every bug fix or feature:
- Add or update tests that fail before implementation and pass after.
- Include at least one negative case and one edge case.

Minimum validation gates:
- `npx tsc --noEmit`
- `npm run build`
- Relevant runtime/API tests from `scripts/`

Booking-specific mandatory tests for booking logic changes:
- Concurrent booking attempts to same slot: exactly one succeeds.
- External calendar unavailable: expected fallback/error behavior.
- Pending/confirmed/cancelled lifecycle transitions.
- Notification behavior (host and guest) per booking type.

If tests are missing:
- Add test scaffolding in same PR, or
- Clearly document why tests cannot be added yet and create a follow-up issue.

## 6. Atomic Booking Policy

Booking acceptance must be atomic at the database layer.

Do not rely only on:
- UI availability checks
- API preflight checks
- in-memory cache

Preferred pattern:
- Canonical `start_at` / `end_at` timestamps
- DB-level overlap prevention (constraint or equivalent transactional lock strategy)
- Clear `409 Conflict` behavior for rejected overlapping bookings

## 7. Database and Migration Rules

- Any schema-affecting change must include migration updates in `scripts/`.
- Migration must be safe for existing environments (`IF NOT EXISTS`, additive-first strategy where possible).
- Data backfill strategy must be documented if needed.
- Avoid destructive migration patterns without explicit plan.

## 8. External API / New Technology Introduction Rules

Any time you introduce:
- a new SDK/library,
- a new external API call/path,
- or a new third-party service,

you must update `Design-log.md` with a `Technologies` section for that feature.

Required `Technologies` content:
1. Technology/API name and version.
2. Why it was chosen for this repo.
3. Competitive alternatives considered.
4. Tradeoffs/risks (cost, lock-in, reliability, latency, rate limits, security).
5. Rollback or fallback plan if integration fails.

Use this exact template in `Design-log.md` when relevant:

```md
### Technologies

- Technology/API:
- Version/Scope:
- Why chosen:
- Alternatives considered:
  - Option A:
  - Option B:
- Tradeoffs and risks:
- Fallback/rollback plan:
```

## 9. Security and Privacy Baseline

- Never commit secrets, tokens, API keys, OAuth credentials, or client secret files.
- Validate and sanitize user inputs at API boundaries.
- Use secure cookie flags in production (`httpOnly`, `secure`, `sameSite`).
- Avoid leaking internal errors or sensitive metadata to clients.
- Minimize PII in logs.

## 10. Reliability and Observability Baseline

- Treat calendar sync and notification delivery as failure-prone.
- For external failures:
  - return explicit API status,
  - persist consistent internal state,
  - log actionable error context (without secrets),
  - support retries where safe.

Add/maintain telemetry for:
- booking creation attempts/success/conflicts,
- external API failures,
- confirmation and cancellation outcomes.

## 11. Definition of Done (DoD)

A change is done only when all are true:
1. Behavior is correct for happy path and failure paths.
2. Tests cover the new/changed logic.
3. Typecheck and build pass.
4. Migration updates are included if schema changed.
5. `Design-log.md` updated with feature summary and commit hash.
6. `Technologies` section added when introducing a new stack/API.
7. Change is committed on a non-main branch.

## 12. Preferred Agent Output During Work

When an agent works on tasks in this repo, it should:
- State assumptions explicitly.
- Call out risks before merging.
- Highlight any unresolved gaps (especially atomicity, notification guarantees, and sync correctness).
- Provide clear next steps if a full fix requires multi-PR sequencing.

