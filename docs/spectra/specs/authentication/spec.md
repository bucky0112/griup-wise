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
