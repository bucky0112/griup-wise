## Problem

The server cannot tell whether a session cookie was issued by it. `createSession` in `src/lib/session.ts` stores the session as plain JSON in the `group-wise-session` cookie, and `getSession` accepts any cookie value that parses as JSON. Every admin page and `/api/admin/*` route authorises requests from that parsed value (`session.type === 'admin'`, `session.id` compared with `quizzes.createdBy`), so the integrity of the cookie is the only thing standing between a browser and admin access. Found during local acceptance testing on 2026-10-16; it affects the production site.

The 6-hour lifetime is likewise enforced only by the cookie's `maxAge`, which the browser honours but the server never checks.

## Root Cause

`src/lib/session.ts` serialises the session with `JSON.stringify` and deserialises it with `JSON.parse`; there is no signature, no server-side secret, and no issue or expiry time inside the value.

## Proposed Solution

- Sign the session value with HMAC-SHA256 using a server-side secret from the new environment variable `SESSION_SECRET`, and embed an expiry time in the signed payload.
- `getSession` returns the session only when the signature verifies, the payload has not expired, and its shape matches `AdminSession` or `StudentSession`; anything else is treated as no session.
- Missing or too-short `SESSION_SECRET` fails fast with a descriptive error when a session is signed or read, instead of silently falling back.
- Set `SESSION_SECRET` on Railway staging and production before deploying. Existing unsigned cookies stop working, so every admin and student logs in again once.

## Non-Goals (optional)

See design.md.

## Success Criteria

- A cookie produced by `createSession` round-trips through `getSession` unchanged.
- A cookie whose payload or signature was altered, an unsigned JSON cookie in the old format, a cookie signed with a different secret, and a cookie past its expiry all make `getSession` return `null`.
- After deployment, `GET /api/admin/quizzes` with an old-format cookie returns 401 on staging and production, and logging in through the UI still works.

## Impact

- Affected code:
  - Modified: src/lib/session.ts, README.md
  - New: src/lib/session-token.ts, src/lib/__unit__/session-token.test.ts
  - Removed: none
- Configuration: new required environment variable `SESSION_SECRET` (at least 32 characters) in local `.env.local` and Railway staging and production. Tests pass the secret explicitly to the token functions and existing route tests mock `@/lib/session`, so the Vitest environment needs no new variable.
- Users: all current sessions are invalidated at deploy; admins and students must log in again. Students re-attach to their existing participant record by student number, so no answers are lost.
