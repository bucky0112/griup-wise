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

---
### Requirement: Student login matches name and student number

When a student logs in to a quiz through `POST /api/auth/student` and a participant with the same normalized student number already exists in that quiz, the system SHALL log the student in as that participant only when the submitted display name matches the stored display name. Two names match when they are equal after trimming surrounding whitespace and ignoring letter case. When the names do not match, the system SHALL respond with HTTP 409 and the message `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師`, SHALL NOT create a session, and SHALL NOT create or change any participant. When two first logins with the same student number for the same quiz are processed concurrently, the system SHALL create exactly one participant and SHALL apply the same name check to the other login instead of failing with HTTP 500.

#### Scenario: Same student number with a different name is rejected

- **WHEN** quiz Q has a participant with student number `S001` and display name `王小明`
- **AND** a student logs in to Q with student number `s001` and display name `李大華`
- **THEN** the response status is 409 with the message `此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師`
- **AND** no session cookie is set and Q still has exactly one participant with student number `S001`, named `王小明`

#### Scenario: Same student number with the same name logs in

- **WHEN** quiz Q has a participant with student number `S001` and display name `Amy Chen`
- **AND** a student logs in to Q with student number `S001` and display name ` amy chen `
- **THEN** the response status is 200 and the session belongs to the existing participant

##### Example: name matching

| Stored name | Submitted name | Result |
| ----------- | -------------- | ------ |
| `王小明` | `王小明` | login |
| `王小明` | ` 王小明 ` | login |
| `Amy Chen` | `AMY CHEN` | login |
| `王小明` | `王曉明` | 409 |
| `Amy Chen` | `Amy  Chen` | 409 |

#### Scenario: Concurrent first logins with the same student number

- **WHEN** quiz Q has no participant with student number `S002`
- **AND** two logins to Q with student number `S002` and display names `甲` and `乙` are processed concurrently
- **THEN** Q has exactly one participant with student number `S002`
- **AND** one response has status 200 and the other has status 409

#### Scenario: Unavailable quiz is still reported as unavailable

- **WHEN** a student logs in to a quiz that does not exist or is not active
- **THEN** the response status is 401 with the message `測驗不存在或未開放，請檢查測驗代碼`

<!-- @trace
source: student-login-name-check
updated: 2026-10-19
code:
  - CLAUDE.md
-->