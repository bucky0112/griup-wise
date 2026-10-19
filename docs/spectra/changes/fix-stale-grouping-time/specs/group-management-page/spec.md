## ADDED Requirements

### Requirement: Grouping time follows the displayed run

The group management page SHALL show `分組時間` as the first item of the 分組配置 card, taken from the creation time of the grouping run whose groups the page currently shows, formatted with the `zh-TW` locale in the `Asia/Taipei` time zone. When the page reloads the groups without a browser reload and the active run has changed, `分組時間` SHALL show the new run's creation time. The page SHALL NOT show a second `分組時間` under its title. When the quiz has no active run, the page SHALL NOT show `分組時間`.

#### Scenario: Reload after another session regrouped

- **WHEN** the admin's page shows run R1 and another session's regroup replaces it with run R2
- **AND** the page reloads the groups after a rejected edit returns 409
- **THEN** the 分組配置 card shows R2's creation time and no element on the page shows R1's creation time

#### Scenario: Time is shown in Taipei time

- **WHEN** the page renders a run created at a given UTC instant
- **THEN** `分組時間` shows that instant in Taipei time, identically on the server render and after hydration

##### Example: formatted times

| created_at (UTC) | Shown |
| ---------------- | ----- |
| `2026-10-19T04:14:45.000Z` | `2026/10/19 下午12:14:45` |
| `2026-10-19T16:00:00.000Z` | `2026/10/20 上午12:00:00` |
