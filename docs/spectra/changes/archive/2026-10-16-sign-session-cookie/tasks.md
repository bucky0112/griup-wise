## 1. Signed session token

- [x] 1.1 Session cookies are signed and expire on the server — per "HMAC-signed token built on node:crypto", "Expiry inside the signed payload" and "Validate the payload shape after verification": write `src/lib/__unit__/session-token.test.ts` first with one case per row of the spec's "token verification outcomes" table, plus a round-trip case for a student session; then add `signSessionToken` and `verifySessionToken` in `src/lib/session-token.ts`. Verify: the test fails before the module exists and every case passes after, under `pnpm test`.
- [x] 1.2 [after: 1.1] `createSession` writes a signed token and `getSession` returns only verified sessions — per "Pure token module with explicit inputs" and "Fail fast on a missing secret": `src/lib/session.ts` keeps its exported functions and cookie options, uses `SESSION_MAX_AGE_SECONDS` for both `maxAge` and `exp`, and reads the secret through `readSessionSecret()`, which throws the error naming `SESSION_SECRET` when it is missing or shorter than 32 characters. Add a `SESSION_SECRET` placeholder line with a generation hint to `.env.example` and a generated value to the local `.env.local`. Verify: `pnpm test` and `pnpm lint` exit 0, and `pnpm build` exits 0 with `SESSION_SECRET` unset in the shell and absent from the build environment.

## 2. Local acceptance

- [x] 2.1 [after: 1.2] Verify manually against `pnpm dev` with the local test admin: logging in through `/login` reaches `/admin`; `curl` to `GET /api/admin/quizzes` with the new cookie returns 200; with an unsigned JSON cookie in the old format, or with the new cookie's payload altered, it returns 401; and `/admin` with the old-format cookie redirects to `/login`.

## 3. Rollout

- [x] 3.1 [after: 2.1] Set a random 64-character hex `SESSION_SECRET` on the Railway staging `web` service without printing it, deploy this branch to staging, and verify: `curl` to `GET /api/admin/quizzes` with an old-format cookie returns 401, and the user logs in on staging through the UI and reaches `/admin`. Record the result in the PR description.
- [x] 3.2 [after: 3.1] With the user's confirmation, set a different random 64-character hex `SESSION_SECRET` on the Railway production `web` service, then deploy the merged `main` to production and verify the same two checks there. Record the result in the PR.

## Change notes

- Task 1.2's `.env.example` step could not be committed: `.gitignore` excludes `.env*`, so the file was never tracked. `SESSION_SECRET` is documented in the README's environment variable table instead (decided during apply on 2026-10-16; proposal and design updated to match).
