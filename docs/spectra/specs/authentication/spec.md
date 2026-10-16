# authentication Specification

## Purpose

Authentication covers how admins and students end their session and where the browser goes afterwards.

## Requirements

### Requirement: Logout redirects on the same origin with GET

`POST /api/auth/logout` SHALL clear the session and respond with HTTP 303 and a relative `Location` header, so the browser follows it with GET on the origin it used. The location SHALL be `/login` for an admin session, `/quiz/complete` for a student session, and `/` without a session. The response SHALL NOT depend on `NEXT_PUBLIC_APP_URL`.

#### Scenario: Admin logs out from an admin page

- **WHEN** an admin submits the logout form
- **THEN** the response status is 303 with `Location: /login`
- **AND** the session cookie is cleared

##### Example: redirect targets

| Session | Status | Location |
| ------- | ------ | -------- |
| admin | 303 | /login |
| student | 303 | /quiz/complete |
| none | 303 | / |

#### Scenario: Configuration does not change the target

- **WHEN** `NEXT_PUBLIC_APP_URL` is unset or points at another host
- **THEN** the logout response still has the relative `Location` from the table above

<!-- @trace
source: fix-logout-redirect
updated: 2026-10-16
code:
  - src/app/api/auth/logout/route.ts
  - src/app/api/auth/logout/__unit__/route.test.ts
-->

---
### Requirement: Session cookies are signed and expire on the server

The session cookie SHALL carry the session data together with an expiry time and an HMAC-SHA256 signature computed with the server secret `SESSION_SECRET`. The server SHALL treat a request as having a session only when the signature verifies with that secret, the expiry time is in the future, and the session data matches the admin or student session shape. Any other cookie value SHALL be treated exactly as if no session cookie were sent. Sessions SHALL expire 6 hours after login.

#### Scenario: Issued session is accepted

- **WHEN** a user logs in and the browser sends back the cookie it received, within 6 hours
- **THEN** the server recognises the same user and session type as at login

#### Scenario: Cookie not issued by the server is rejected

- **WHEN** a request carries a session cookie that the server did not issue unchanged
- **THEN** the request is handled as unauthenticated
- **AND** admin APIs respond 401 and admin pages redirect to `/login`

##### Example: token verification outcomes

| Cookie value | Result |
| ------------ | ------ |
| token signed with the server secret, 1 hour old | session returned |
| same token with one payload character changed | no session |
| same token with the signature replaced | no session |
| unsigned JSON `{"type":"admin",...}` (pre-change format) | no session |
| token signed with a different secret | no session |
| token signed with the server secret, issued 6 hours and 1 second ago | no session |
| token signed with the server secret whose session has `type: "owner"` | no session |
| empty string or `abc` | no session |

#### Scenario: Server secret is missing

- **WHEN** `SESSION_SECRET` is unset or shorter than 32 characters and a session is created or read
- **THEN** the operation fails with an error naming `SESSION_SECRET`
- **AND** no session is created or accepted

<!-- @trace
source: sign-session-cookie
updated: 2026-10-16
code:
  - src/lib/session-token.ts
  - src/lib/session.ts
  - src/lib/__unit__/session-token.test.ts
  - src/lib/__unit__/session.test.ts
-->