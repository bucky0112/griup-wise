## ADDED Requirements

### Requirement: Question prompt keeps its line breaks

The add-question and edit-question forms SHALL edit the question prompt in a multi-line text area that accepts and displays line breaks. Saving a question SHALL store the prompt with its line breaks unchanged. Every admin page that displays a question prompt SHALL render each stored line break as a visible line break.

#### Scenario: Admin adds a multi-line prompt

- **WHEN** an admin types a prompt containing line breaks in the add-question form and submits it
- **THEN** the questions API receives the prompt with the same line breaks
- **AND** the admin question list shows the prompt on separate lines

#### Scenario: Editing keeps existing line breaks

- **WHEN** an admin opens the edit form of a question whose prompt contains line breaks and saves after changing only the score
- **THEN** the stored prompt is identical to the prompt before the edit

##### Example: prompt round trip

- **GIVEN** a stored prompt `"需求：\n- 電腦版：一列 3 張\n- 手機：一列 1 張"`
- **WHEN** the admin changes the score from 5 to 10 in the edit form and saves
- **THEN** the stored prompt is still `"需求：\n- 電腦版：一列 3 張\n- 手機：一列 1 張"`

#### Scenario: Admin answer page shows prompt line breaks

- **WHEN** an admin opens a participant's answer page for a quiz whose question prompt contains line breaks
- **THEN** the prompt is shown on separate lines
