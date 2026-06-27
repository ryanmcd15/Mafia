# Requirements Document

## Introduction

The Party Games Platform transforms the existing Mafia social deduction game into a multi-game party platform. The platform extracts the shared lobby and room infrastructure into a game-agnostic layer, adds a landing page and game selection screen, and introduces three additional games (Truth or Dare, 2 Truths 1 Lie, Spyfall) alongside the existing Mafia game. The system retains its real-time, mobile-first, in-memory architecture using Socket.io, React, and Node.js.

---

## Glossary

- **Platform**: The game-agnostic layer that manages rooms, players, and game selection independent of any specific game.
- **Room**: A uniquely identified session that players join using a Room_Code, managed by the Platform layer.
- **Room_Code**: A 6-character uppercase alphanumeric code used to identify and join a Room.
- **Host**: The player who created the Room. The Host has authority to select games and manage the session.
- **Player**: A human participant connected via a browser on a personal device.
- **Game_Module**: A self-contained implementation of a specific game that plugs into the Platform (e.g., Mafia, Truth or Dare, 2 Truths 1 Lie, Spyfall).
- **Landing_Page**: The initial screen where players create or join a Room.
- **Game_Selection_Screen**: The screen displayed after players join a Room where the Host selects which Game_Module to play.
- **Server**: The Node.js backend application managing all Platform and Game_Module state.
- **Client**: The browser-based frontend application running on each Player's device.
- **Socket**: A persistent bi-directional real-time connection between a Client and the Server using Socket.io.
- **Submission_Phase**: A pre-game phase where players provide content (prompts, statements) before gameplay begins.
- **Ready_Status**: An indicator that a Player has completed their Submission_Phase input and is prepared to begin.
- **Spinning_Wheel**: An animated UI component that rotates through Player names and lands on one selected Player.
- **Prompt_Pool**: The collection of all truths and dares submitted by all Players during the Submission_Phase.
- **Statement_Set**: A group of exactly 3 statements (2 truths and 1 lie) submitted by a single Player.
- **Location_Card**: A card shown to all non-Spy Players in Spyfall identifying the shared location.
- **Spy**: The single Player in Spyfall who does not receive the Location_Card and must deduce the location.
- **Scoreboard**: A display showing each Player's cumulative score during a scored game.

---

## Requirements

### Requirement 1: Platform Landing Page

**User Story:** As a Player, I want a landing page where I can create or join a room, so that I can start a party game session with friends.

#### Acceptance Criteria

1. WHEN a Player navigates to the application root URL, THE Client SHALL display the Landing_Page with options to create a new Room or join an existing Room by entering a Room_Code and player name.
2. WHEN a Player submits a create room request with a player name between 1 and 32 characters, THE Server SHALL create a new Room with a unique Room_Code and designate that Player as the Host.
3. WHEN a Player submits a join room request with a valid Room_Code and a player name between 1 and 20 characters, THE Server SHALL add the Player to the corresponding Room.
4. IF a create or join request is received with an empty or invalid player name, THEN THE Server SHALL reject the request and return an error message indicating the name constraint.
5. IF a join request references a Room_Code that does not match any active Room, THEN THE Server SHALL return an error message indicating the Room was not found.
6. IF a join request is received for a Room that already contains 10 Players, THEN THE Server SHALL reject the request and return an error message indicating the Room is full.
7. IF a join request is received with a player name already used by a connected Player in the same Room, THEN THE Server SHALL reject the request and return an error message indicating the name is taken.

---

### Requirement 2: Game Selection Screen

**User Story:** As the Host, I want to choose which game to play after players join, so that the group can decide together what to play.

#### Acceptance Criteria

1. WHEN all Players have joined the Room and the Room is in the Lobby phase, THE Client SHALL display the Game_Selection_Screen to all Players showing the list of available Game_Modules.
2. THE Game_Selection_Screen SHALL display at minimum the following Game_Modules: Mafia, Truth or Dare, 2 Truths 1 Lie, and Spyfall.
3. WHEN the Host selects a Game_Module on the Game_Selection_Screen, THE Client SHALL emit a `selectGame` event to the Server with the chosen Game_Module identifier.
4. WHEN the Server receives a valid `selectGame` event from the Host, THE Server SHALL load the corresponding Game_Module, transition the Room into that game's initial phase, and emit a `gameSelected` event to all Players containing the Game_Module identifier.
5. IF a non-Host Player submits a `selectGame` event, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.
6. IF a `selectGame` event references an unrecognized Game_Module identifier, THEN THE Server SHALL reject the request and return an error message indicating the game is not available.
7. WHILE the Game_Selection_Screen is displayed, THE Client SHALL show the current player list, the Room_Code, and indicate which Player is the Host.
8. WHILE the Room contains fewer than the minimum player count required by any displayed Game_Module, THE Client SHALL display that Game_Module as unavailable with a message indicating the minimum player requirement.

---

### Requirement 3: Game-Agnostic Room Infrastructure

**User Story:** As a developer, I want the room and lobby infrastructure to be game-agnostic, so that new games can be added without modifying the platform layer.

#### Acceptance Criteria

1. THE Platform SHALL manage Room creation, Room_Code generation, Player joining, Player disconnection, Host transfer, and Player removal independently of any Game_Module.
2. THE Platform SHALL expose a Game_Module interface that each game implements, defining lifecycle hooks for game start, player actions, phase transitions, and game end.
3. WHEN a Game_Module completes (game over), THE Platform SHALL transition the Room back to the Game_Selection_Screen, retaining all connected Players.
4. THE Server SHALL route game-specific Socket events to the active Game_Module instance for the Room.
5. WHEN the Host disconnects while no Game_Module is active, THE Platform SHALL transfer Host status to the next connected Player and emit a `roomUpdated` event.
6. THE Platform SHALL enforce per-game minimum and maximum Player count constraints defined by each Game_Module before allowing game start.

---

### Requirement 4: Mafia Game Module Integration

**User Story:** As a Player, I want to play the existing Mafia game as one option on the platform, so that the original game continues to work within the new multi-game structure.

#### Acceptance Criteria

1. WHEN the Host selects the Mafia Game_Module, THE Server SHALL initialize the Mafia game using the existing game logic (role assignment, night actions, voting, win conditions) without modification to game rules.
2. THE Mafia Game_Module SHALL require a minimum of 4 Players and a maximum of 10 Players.
3. WHEN the Mafia game reaches GameOver, THE Platform SHALL display the game results and then return all Players to the Game_Selection_Screen.
4. THE Mafia Game_Module SHALL reside in a `games/mafia` module directory within both the server and client codebases.

---

### Requirement 5: Truth or Dare — Submission Phase

**User Story:** As a Player, I want to submit truths and dares before the game starts, so that the game has a pool of player-generated prompts to draw from.

#### Acceptance Criteria

1. WHEN the Truth or Dare Game_Module starts, THE Server SHALL transition all Players to the Submission_Phase and THE Client SHALL display a form allowing each Player to enter truths and dares.
2. WHILE in the Submission_Phase, THE Client SHALL allow each Player to submit any number of prompts (minimum 1), each labelled as either "Truth" or "Dare".
3. WHEN a Player submits a prompt, THE Server SHALL validate that the prompt text is between 1 and 280 characters and store it in the Prompt_Pool associated with the Room.
4. IF a prompt submission contains empty text or text exceeding 280 characters, THEN THE Server SHALL reject the submission and return an error message indicating the character constraint.
5. WHILE in the Submission_Phase, THE Client SHALL display a "Ready" button that each Player can tap after submitting at least 1 prompt.
6. WHEN a Player taps "Ready", THE Client SHALL emit a `playerReady` event to the Server, and THE Server SHALL update that Player's Ready_Status.
7. WHEN all Players in the Room have Ready_Status set to true, THE Server SHALL transition the game to the Play phase and emit a `gamePhaseChanged` event to all Players.
8. WHILE in the Submission_Phase, THE Client SHALL display which Players are ready and which are still submitting.

---

### Requirement 6: Truth or Dare — Gameplay

**User Story:** As a Player, I want to spin a wheel that selects someone to answer a truth or dare, so that the game is fun and unpredictable.

#### Acceptance Criteria

1. WHEN the Truth or Dare game enters the Play phase, THE Client SHALL display the Spinning_Wheel containing all Player names.
2. WHEN the Host taps "Spin", THE Client SHALL emit a `spinWheel` event to the Server, and THE Server SHALL randomly select a Player and emit a `wheelResult` event to all Players containing the selected Player's name.
3. WHEN a Player is selected by the Spinning_Wheel, THE Client SHALL display "Truth" and "Dare" buttons to the selected Player only.
4. WHEN the selected Player taps "Truth" or "Dare", THE Client SHALL emit a `choiceSelected` event to the Server with the chosen category.
5. WHEN the Server receives a `choiceSelected` event, THE Server SHALL select a random prompt from the Prompt_Pool matching the chosen category and emit a `promptRevealed` event to all Players containing the prompt text.
6. IF the Prompt_Pool contains no prompts matching the chosen category, THEN THE Server SHALL select a random prompt from the remaining category and emit a `promptRevealed` event indicating the substitution.
7. WHEN the prompt is displayed, THE Client SHALL show the prompt text, the selected Player's name, and the category (Truth or Dare) on all Players' screens.
8. WHEN the Host taps "Next", THE Client SHALL emit a `nextTurn` event to the Server, and THE Server SHALL reset the turn state and signal all Clients to display the Spinning_Wheel for a new spin.
9. IF a non-Host Player submits a `spinWheel` or `nextTurn` event, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.

---

### Requirement 7: Truth or Dare — Game End

**User Story:** As the Host, I want to end the Truth or Dare game when the group is done, so that players can return to the game selection screen.

#### Acceptance Criteria

1. WHILE the Truth or Dare game is in the Play phase, THE Client SHALL display an "End Game" button visible only to the Host.
2. WHEN the Host taps "End Game", THE Client SHALL emit an `endGame` event to the Server.
3. WHEN the Server receives an `endGame` event from the Host, THE Server SHALL terminate the Truth or Dare session and transition the Room back to the Game_Selection_Screen.
4. IF a non-Host Player submits an `endGame` event, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.

---

### Requirement 8: 2 Truths 1 Lie — Submission Phase

**User Story:** As a Player, I want to privately enter 2 truths and 1 lie about myself, so that other players can try to guess which is the lie.

#### Acceptance Criteria

1. WHEN the 2 Truths 1 Lie Game_Module starts, THE Server SHALL transition all Players to the Submission_Phase and THE Client SHALL display a form with exactly 3 text input fields labelled "Statement 1", "Statement 2", and "Statement 3".
2. THE Client SHALL require the Player to mark exactly 2 statements as truths and exactly 1 statement as the lie before submission is allowed.
3. WHEN a Player submits their Statement_Set, THE Server SHALL validate that exactly 3 statements are provided, each between 1 and 200 characters, with exactly 1 marked as the lie.
4. IF a Statement_Set submission does not meet the validation criteria, THEN THE Server SHALL reject the submission and return a descriptive error message.
5. WHEN a Player submits a valid Statement_Set, THE Server SHALL store the Statement_Set privately and update that Player's Ready_Status.
6. WHEN all Players have submitted their Statement_Sets, THE Server SHALL transition the game to the Play phase and emit a `gamePhaseChanged` event to all Players.
7. THE Server SHALL NOT reveal which statement is the lie or which statements are truths to any other Player until the reveal step.

---

### Requirement 9: 2 Truths 1 Lie — Gameplay Loop

**User Story:** As a Player, I want to see another player's statements, vote on which is the lie, and see the reveal, so that the game is interactive and engaging.

#### Acceptance Criteria

1. WHEN the 2 Truths 1 Lie game enters the Play phase, THE Server SHALL select the first Player whose Statement_Set has not yet been presented and emit a `statementsPresented` event containing that Player's 3 statements in a shuffled order (different from submission order) and the presenting Player's name.
2. WHEN a `statementsPresented` event is received, THE Client SHALL display the 3 statements and prompt all Players except the presenting Player to vote on which statement they believe is the lie.
3. WHEN a Player submits a vote via a `submitLieVote` event, THE Server SHALL record the vote.
4. THE Server SHALL accept only one vote per Player per round; duplicate votes SHALL be rejected with an error message.
5. WHEN all eligible Players have voted or a 45-second voting timer expires, THE Server SHALL emit a `lieRevealed` event to all Players containing the correct lie, each Player's vote, and which Players guessed correctly.
6. WHEN the Server emits the `lieRevealed` event, THE Server SHALL award 1 point to each Player who correctly identified the lie.
7. WHEN the reveal is complete and the Host taps "Next", THE Server SHALL advance to the next Player's Statement_Set, or transition to the scoring summary if all Players have been presented.
8. WHEN all Players' Statement_Sets have been presented, THE Server SHALL emit a `gameOver` event containing the final Scoreboard with each Player's total points, sorted by score descending.

---

### Requirement 10: 2 Truths 1 Lie — Scoring

**User Story:** As a Player, I want to see scores throughout the game, so that I know how well I'm doing compared to others.

#### Acceptance Criteria

1. THE Server SHALL maintain a score for each Player, initialized to 0 at the start of the game.
2. WHEN a Player correctly identifies the lie in a round, THE Server SHALL increment that Player's score by 1.
3. WHILE the 2 Truths 1 Lie game is in the Play phase, THE Client SHALL display the current Scoreboard showing all Players' names and scores, updated after each round's reveal.
4. WHEN the game ends, THE Client SHALL display the final Scoreboard with Players ranked by score descending, highlighting the winner (highest score).

---

### Requirement 11: Spyfall — Game Setup

**User Story:** As a Player, I want the game to assign a secret location to everyone except the spy, so that the game of deduction can begin.

#### Acceptance Criteria

1. WHEN the Spyfall Game_Module starts, THE Server SHALL randomly select one Player as the Spy and randomly select one location from a predefined location list.
2. THE Server SHALL emit a `roleAssigned` event to each non-Spy Player's Client containing the selected Location_Card text and an indication that the Player is not the Spy.
3. THE Server SHALL emit a `roleAssigned` event to the Spy Player's Client indicating that the Player is the Spy, without revealing the location.
4. THE Spyfall Game_Module SHALL require a minimum of 4 Players and a maximum of 10 Players.
5. THE Server SHALL maintain a predefined list of at least 20 distinct locations for Spyfall games.
6. WHEN the Spy Player's Client receives the role assignment, THE Client SHALL display a list of all possible locations so the Spy can attempt to deduce the correct one.

---

### Requirement 12: Spyfall — Question Phase

**User Story:** As a Player, I want to take turns asking other players questions, so that I can figure out who the spy is (or if I'm the spy, figure out the location).

#### Acceptance Criteria

1. WHEN the Spyfall game enters the Question phase, THE Server SHALL randomly select the first questioner and emit a `turnStarted` event to all Players indicating the current questioner.
2. WHEN the questioner selects another Player to ask a question to, THE Client SHALL emit a `selectTarget` event to the Server, and THE Server SHALL emit a `questionTarget` event to all Players indicating who is being asked.
3. THE Platform SHALL NOT enforce question content or answers via text input; questions and answers are exchanged verbally among co-located Players.
4. WHEN the questioned Player taps "Done" to indicate they have answered, THE Client SHALL emit a `answerComplete` event to the Server, and THE Server SHALL advance the turn to the next questioner in clockwise order.
5. THE Server SHALL track the turn order and ensure each Player gets an equal number of turns as questioner before any Player gets an additional turn.
6. WHILE the Question phase is active, THE Client SHALL display the current questioner, the current target, and a game timer counting down.

---

### Requirement 13: Spyfall — Timer and Voting

**User Story:** As a Player, I want a timer that limits the round and a way to vote on who the spy is, so that the game has tension and resolution.

#### Acceptance Criteria

1. WHEN the Spyfall game enters the Question phase, THE Server SHALL start a configurable round timer with a default of 480 seconds (8 minutes).
2. WHEN the round timer expires, THE Server SHALL transition the game to the Voting phase and emit a `votingOpened` event to all Players.
3. WHILE the Question phase is active, THE Client SHALL display the remaining time in MM:SS format, updating at one-second intervals.
4. WHILE the Question phase is active, THE Client SHALL display an "Accuse" button available to all Players; WHEN any Player taps "Accuse", THE Client SHALL emit a `callVote` event to the Server, and THE Server SHALL immediately transition to the Voting phase.
5. WHEN the Voting phase begins, THE Client SHALL prompt each Player to vote on which Player they believe is the Spy.
6. WHEN all Players have submitted votes or a 30-second voting timer expires, THE Server SHALL tally votes and determine the accused Player (most votes, ties result in no accusation).
7. IF the accused Player is the Spy, THEN THE Server SHALL emit a `gameOver` event with the outcome "Players Win" and reveal the Spy's identity and the location.
8. IF the accused Player is not the Spy, THEN THE Server SHALL emit a `gameOver` event with the outcome "Spy Wins" and reveal the Spy's identity and the location.
9. IF there is a tie in votes, THEN THE Server SHALL emit a `gameOver` event with the outcome "Spy Wins" due to failure to reach consensus, and reveal the Spy's identity and the location.

---

### Requirement 14: Spyfall — Spy Guess

**User Story:** As the Spy, I want the option to guess the location at any time, so that I have an alternative win condition if I figure it out.

#### Acceptance Criteria

1. WHILE the Spyfall Question phase is active, THE Client SHALL display a "Guess Location" button visible only to the Spy Player.
2. WHEN the Spy taps "Guess Location", THE Client SHALL display the list of all possible locations for the Spy to select from.
3. WHEN the Spy selects a location and confirms the guess, THE Client SHALL emit a `spyGuess` event to the Server containing the selected location.
4. IF the Spy's guessed location matches the actual game location, THEN THE Server SHALL emit a `gameOver` event with the outcome "Spy Wins" and reveal the Spy's identity and the correct location.
5. IF the Spy's guessed location does not match the actual game location, THEN THE Server SHALL emit a `gameOver` event with the outcome "Players Win" and reveal the Spy's identity and the correct location.

---

### Requirement 15: Platform Return to Game Selection

**User Story:** As a Player, I want to return to the game selection screen after a game ends, so that the group can play another game without re-creating a room.

#### Acceptance Criteria

1. WHEN any Game_Module emits a game over condition, THE Platform SHALL display the game results to all Players for a minimum viewing period of 5 seconds.
2. WHEN the Host taps "Play Again" on the game results screen, THE Platform SHALL clear all game-specific state, retain the Room and connected Players, and transition all Players to the Game_Selection_Screen.
3. WHEN the Host taps "End Session" on the game results screen, THE Platform SHALL terminate the Room and disconnect all Players with a session ended notification.
4. IF a non-Host Player submits a "Play Again" or "End Session" action, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.
5. WHILE the game results screen is displayed, THE Client SHALL show the "Play Again" and "End Session" buttons only to the Host; non-Host Players SHALL see a "Waiting for host..." message.

---

### Requirement 16: Real-Time Synchronization

**User Story:** As a Player, I want all game state changes reflected on my device immediately, so that all players stay in sync throughout any game.

#### Acceptance Criteria

1. THE Server SHALL use Socket.io to maintain a persistent Socket connection with each Client for the duration of the session.
2. WHEN any phase transition occurs in any Game_Module, THE Server SHALL emit a phase change event to all Players in the Room containing the new phase name and relevant state.
3. WHEN a Player's Socket disconnects during an active game, THE Server SHALL retain that Player's state for up to 60 seconds and emit a `roomUpdated` event to remaining Players indicating the disconnection.
4. WHEN a disconnected Player reconnects within 60 seconds using the same Room_Code and player name, THE Server SHALL restore the Player's state and emit a `roomUpdated` event to all Players confirming the reconnection.
5. WHEN a disconnected Player's 60-second retention window expires without reconnection, THE Server SHALL remove that Player from the Room and handle the impact on the active Game_Module (e.g., skip that Player's turn).

---

### Requirement 17: Mobile-First UI

**User Story:** As a Player using a smartphone, I want an interface optimized for my device, so that all games are easy to play on a small touch screen.

#### Acceptance Criteria

1. THE Client SHALL render a responsive layout optimized for viewport widths from 320px to 480px as the primary target, scaling gracefully to larger screens.
2. THE Client SHALL apply a dark theme as the default and only visual theme.
3. THE Client SHALL render all interactive controls with a minimum touch target size of 44x44 CSS pixels.
4. THE Client SHALL NOT require horizontal scrolling at any supported viewport width.
5. THE Spinning_Wheel component SHALL be sized to fit within a 320px viewport without overflow or truncation of Player names.

---

### Requirement 18: In-Memory State Management

**User Story:** As a developer, I want all platform and game state stored in server memory, so that the system can be built and tested without a database dependency.

#### Acceptance Criteria

1. THE Server SHALL store all active Room, Player, and Game_Module state in server memory using JavaScript objects or Maps.
2. THE Server SHALL NOT require a database connection to operate any Platform or Game_Module functionality.
3. WHEN the Server process is restarted, THE Server SHALL initialize with an empty state, requiring all Players to create or join a new Room.

---

### Requirement 19: Player Disconnection Handling During Games

**User Story:** As a Player, I want the game to handle disconnections gracefully, so that one person's connection issue does not break the game for everyone.

#### Acceptance Criteria

1. WHEN a Player disconnects during the Submission_Phase of any game, THE Server SHALL retain their already-submitted content and Ready_Status for up to 60 seconds.
2. WHEN a Player disconnects during the Spyfall Question phase and the disconnected Player is the current questioner, THE Server SHALL skip that Player's turn and advance to the next questioner after a 10-second grace period.
3. WHEN a Player disconnects during a voting phase of any game, THE Server SHALL count that Player as abstaining when tallying votes after the voting timer expires.
4. IF a disconnected Player does not reconnect within 60 seconds during an active game, THEN THE Server SHALL remove that Player from the active game and emit a notification to all remaining Players.
5. IF the Host disconnects during an active game, THEN THE Server SHALL transfer Host status to the next connected Player and emit a `roomUpdated` event.

---

### Requirement 20: Game Module Architecture

**User Story:** As a developer, I want each game to be a self-contained module with a consistent interface, so that adding new games is straightforward.

#### Acceptance Criteria

1. THE Server SHALL define a Game_Module interface requiring: a `start` method, a `handleEvent` method for game-specific Socket events, a `getState` method returning current game state for reconnection, and an `end` method for cleanup.
2. THE Server SHALL organize Game_Module implementations in a `games/` directory with each game in its own subdirectory (e.g., `games/mafia/`, `games/truth-or-dare/`, `games/two-truths-one-lie/`, `games/spyfall/`).
3. THE Client SHALL organize game-specific UI components in a `games/` directory mirroring the server structure.
4. WHEN the Platform loads a Game_Module, THE Platform SHALL pass the Room's player list and Socket connections to the Game_Module's `start` method.
5. THE Game_Module interface SHALL define a `config` property specifying the minimum and maximum Player counts supported by that game.
