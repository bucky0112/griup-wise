## Context

`src/lib/session.ts` exports `createSession(session)`, `getSession()` and `clearSession()`. It is the only code that reads or writes the `group-wise-session` cookie; every admin page, `/api/admin/*` route, student route and `/api/auth/*` route goes through it. The cookie is `httpOnly`, `sameSite: 'lax'`, `secure` in production, `maxAge` 6 hours, and holds `JSON.stringify(session)` where `session` is `AdminSession` (`type`, `id`, `name`, `email`) or `StudentSession` (`type`, `participantId`, `quizId`, `displayName`, `studentNo`) from `src/lib/auth.ts`. `getSession` returns `JSON.parse(value)` cast to `UserSession`, so any JSON the browser sends is trusted.

No route declares the Edge runtime and nothing under `src/lib` is a client module, so `node:crypto` is available wherever sessions are handled. The project has no session or JWT library; `bcryptjs` is the only auth dependency. Existing route tests mock `@/lib/session`.

## Goals / Non-Goals

**Goals:**

- The server accepts only session cookies it issued, unaltered, within their lifetime.
- A misconfigured deployment (no secret) fails loudly instead of running with forgeable sessions.

**Non-Goals:**

- Server-side session storage or revocation lists; sessions remain stateless cookies.
- Re-checking on every request that the admin or participant still exists in the database.
- Student login without a password: a student still logs in with name and student number, by design.
- Secret rotation with multiple accepted keys; changing `SESSION_SECRET` logs everyone out, which is acceptable for this app.
- CSRF protections beyond the existing `sameSite: 'lax'`.

## Decisions

### HMAC-signed token built on node:crypto

Encode the cookie value as `<payload>.<signature>`, where `payload` is base64url of `JSON.stringify({ session, exp })` and `signature` is base64url of HMAC-SHA256 over the `payload` string with `SESSION_SECRET`. Verification recomputes the HMAC and compares with `crypto.timingSafeEqual` (after a length check) before decoding the payload.

Alternative considered: `jose` (signed JWT). Rejected because it adds a dependency and a header/algorithm negotiation surface for a single-issuer, single-consumer cookie; HMAC from the standard library covers the need in a few lines.

Alternative considered: `iron-session` (encrypted cookie). Rejected because the session holds no secret data (name, email, ids) and the library would also replace the existing cookie handling; integrity is the requirement, confidentiality is not.

### Expiry inside the signed payload

`exp` is the issue time plus the existing 6-hour `SESSION_MAX_AGE`, in seconds since the epoch. A token whose `exp` is not in the future is rejected, so a copied cookie stops working when the browser's copy would have expired.

### Pure token module with explicit inputs

Put `signSessionToken(session, secret, now)` and `verifySessionToken(token, secret, now)` in `src/lib/session-token.ts`. They take the secret and current time as parameters so unit tests need no environment, cookie store or clock mocking. `src/lib/session.ts` keeps its exported API and calls them with `readSessionSecret()` and `new Date()`.

### Validate the payload shape after verification

After the signature and expiry pass, parse `session` with a zod discriminated union matching `AdminSession` and `StudentSession`; a mismatch is treated as no session. This keeps a validly signed token from an older payload shape from reaching code that assumes the current fields.

### Fail fast on a missing secret

`readSessionSecret()` throws `Error('SESSION_SECRET must be set to at least 32 characters')` when the variable is missing or shorter than 32 characters. It runs when a session is created or read, not at import, so `pnpm build` does not need the secret. Railway staging and production get a random 64-character hex value before the deploy.

## Implementation Contract

**Behavior**

- `createSession(session)` sets the same cookie name and options as today, with the signed token as value.
- `getSession()` returns the `UserSession` for a valid token and `null` for: no cookie, malformed token, wrong signature, tampered payload, old unsigned JSON, expired `exp`, or a payload that does not match either session shape.
- Request handlers are unchanged; a request with a rejected cookie behaves exactly like an unauthenticated request today (admin pages redirect to `/login`, admin APIs return 401).

**Interface / data shape**

- `signSessionToken(session: UserSession, secret: string, now: Date): string`
- `verifySessionToken(token: string, secret: string, now: Date): UserSession | null`
- `SESSION_MAX_AGE_SECONDS = 6 * 60 * 60` shared by the cookie `maxAge` and `exp`.
- Environment: `SESSION_SECRET`, string, at least 32 characters; documented in the README's environment variable table without a real value (`.env.example` is gitignored, so it cannot carry the documentation).

**Failure modes**

- Missing or short `SESSION_SECRET`: `createSession` and `getSession` throw the descriptive error; the request fails with the route's existing 500 handling. `getSession` does not swallow this error, unlike verification failures.
- Every verification failure returns `null` silently; no detail about why is sent to the client.

**Acceptance criteria**

- `src/lib/__unit__/session-token.test.ts` covers every row of the spec's example table and passes under `pnpm test`.
- `pnpm test`, `pnpm lint`, `pnpm build` exit 0; `pnpm build` runs without `SESSION_SECRET` set.
- Local and staging: logging in as admin through the UI works; `curl` to `GET /api/admin/quizzes` with an old-format unsigned cookie returns 401.

**Scope boundaries**

- In scope: `src/lib/session.ts`, the new token module and its test, the README environment variable table, setting `SESSION_SECRET` on Railway staging and production.
- Out of scope: route handlers, login flows, database schema, the student authentication model.

## Risks / Trade-offs

- [Everyone is logged out at deploy] Old cookies are rejected, including students in the middle of a quiz. Mitigation: deploy when no quiz is running; students re-login with the same student number and keep their participant record.
- [Secret not set on Railway] The app would fail every authenticated request. Mitigation: set the variable on staging, verify, then production, before deploying the code; the error message names the variable.
- [Public repository] The fix's diff reveals the weakness it closes. Mitigation: deploy to production promptly after the PR is opened.
