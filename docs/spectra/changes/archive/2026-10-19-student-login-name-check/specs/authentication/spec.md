## ADDED Requirements

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
