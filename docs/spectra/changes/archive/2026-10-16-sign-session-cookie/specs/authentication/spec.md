## ADDED Requirements

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
