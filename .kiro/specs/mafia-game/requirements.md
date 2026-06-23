# Requirements Document

## Introduction

The Mafia Companion Web App is a mobile-first, real-time social deduction game for groups of players physically present in the same room. Each player uses their own smartphone browser. The application replaces the traditional human narrator/host, automating all game flow, narration, role assignments, night actions, voting, and win condition checks. The server is the single source of truth; clients only display state and submit player actions.

---

## Glossary

- **Game**: A single playable session encompassing all phases from Lobby to GameOver.
- **Room**: A uniquely identified game instance players join using a Room Code.
- **Room_Code**: A short alphanumeric code used to identify and join a Room.
- **Host**: The player who created the Room. The Host has the authority to start the Game.
- **Player**: A human participant in the Game, connected via a browser on a personal device.
- **Role**: A secret assignment given to each Player. One of: Killer, Medic, or Civilian.
- **Killer**: The Role assigned to exactly one Player whose goal is to eliminate non-Killer Players.
- **Medic**: The Role assigned to exactly one Player who can protect one Player per Night Phase.
- **Civilian**: The Role assigned to all Players who are not the Killer or Medic.
- **GamePhase**: The current state of the Game. One of: Lobby, RoleReveal, Night, Morning, Discussion, Voting, Results, GameOver.
- **Night_Actions**: The set of actions submitted by the Killer (kill target) and the Medic (save target) during the Night Phase.
- **Narration**: Cinematic text displayed to all Players simultaneously during the Morning Phase describing the outcome of the previous Night Phase.
- **Vote**: A living Player's selection of another living Player to eliminate during the Voting Phase.
- **Server**: The Node.js backend application that manages all Game state.
- **Client**: The browser-based frontend application running on each Player's device.
- **GameManager**: The server-side module responsible for managing all active Rooms and Games.
- **VoteManager**: The server-side module responsible for collecting, tallying, and resolving Votes.
- **Socket**: A persistent bi-directional real-time connection between a Client and the Server using Socket.io.

---

## Requirements

### Requirement 1: Room Creation

**User Story:** As a Player, I want to create a new game room, so that I can invite others to join and start a game.

#### Acceptance Criteria

1. WHEN a Player submits a `createRoom` event with a player name between 1 and 32 characters, THE Server SHALL create a new Room with a unique Room_Code and designate that Player as the Host.
2. WHEN a Room is created, THE Server SHALL emit a `roomUpdated` event to all Players in the Room containing the current player list and Host identity.
3. THE Server SHALL generate Room_Codes of exactly 6 uppercase alphanumeric characters that are unique among all Rooms that have not yet been terminated.
4. IF a `createRoom` event is received with an empty, missing, or greater than 32 character player name, THEN THE Server SHALL reject the request with an error message indicating the name constraint, without creating a Room.
5. IF the Server fails to generate a unique Room_Code after 10 attempts, THEN THE Server SHALL reject the `createRoom` request and return an error message indicating the service is temporarily unavailable.
6. THE Server SHALL treat the Room creator's name as subject to the same uniqueness rules as any joining Player; the name must be between 1 and 32 characters and must not duplicate any other connected Player's name in the Room.

---

### Requirement 2: Room Joining

**User Story:** As a Player, I want to join an existing room using a room code, so that I can participate in a game with others.

#### Acceptance Criteria

1. WHEN a Player submits a `joinRoom` event with a Room_Code matching an active Room and a player name between 1 and 20 characters, THE Server SHALL add the Player to the corresponding Room and emit a `roomUpdated` event to all Players in the Room.
2. IF a `joinRoom` event references a Room_Code that does not match any active Room, THEN THE Server SHALL return an error message indicating the Room was not found, without modifying any state.
3. IF a `joinRoom` event is received with an empty, missing, or greater than 20 character player name, THEN THE Server SHALL return an error message indicating the name constraint, without modifying any state.
4. IF a `joinRoom` event is received for a Room that has already started a Game, THEN THE Server SHALL reject the request and return an error message indicating the Game is already in progress, without modifying any state.
5. WHEN a Player joins a Room, THE Client SHALL display the Room_Code and the list of all currently connected Players.
6. IF a `joinRoom` event is received for a Room that already contains 10 Players, THEN THE Server SHALL reject the request and return an error message indicating the Room is full, without modifying any state.
7. IF a `joinRoom` event is received with a player name already used by a connected Player in the same Room, THEN THE Server SHALL reject the request and return an error message indicating the name is taken, without modifying any state.

---

### Requirement 3: Lobby State Display

**User Story:** As a Player in the Lobby, I want to see who has joined the room, so that I know when everyone is ready to start.

#### Acceptance Criteria

1. WHILE the GamePhase is Lobby, THE Client SHALL display the Room_Code, the full list of connected Players by name, and the Host's name.
2. WHEN a new Player joins or leaves the Room, THE Server SHALL emit a `roomUpdated` event to all Players in the Room.
3. WHEN the Client receives a `roomUpdated` event, THE Client SHALL update the displayed player list without requiring a page refresh.
4. WHILE the GamePhase is Lobby and the Room contains at least 4 Players, THE Client SHALL display an enabled "Start Game" button only to the Host.
5. WHILE the GamePhase is Lobby and the Room contains fewer than 4 Players, THE Client SHALL display a disabled "Start Game" button only to the Host, indicating the minimum player requirement.
6. IF the Host disconnects while the GamePhase is Lobby, THEN THE Server SHALL designate the next connected Player as the new Host and emit a `roomUpdated` event reflecting the Host change.

---

### Requirement 4: Game Start

**User Story:** As the Host, I want to start the game once enough players have joined, so that the game can begin.

#### Acceptance Criteria

1. WHEN the Host submits a `startGame` event and the Room contains between 4 and 10 Players inclusive, THE Server SHALL transition the GamePhase to RoleReveal and emit a `gameStarted` event to all Players.
2. IF the Host submits a `startGame` event and the Room contains fewer than 4 Players, THEN THE Server SHALL reject the request and return an error message indicating insufficient players.
3. IF a non-Host Player submits a `startGame` event, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.
4. IF a `startGame` event is received when the GamePhase is not Lobby, THEN THE Server SHALL reject the request and return an error message indicating the Game is already in progress.

---

### Requirement 5: Role Assignment

**User Story:** As a Player, I want to be privately assigned a secret role, so that I know my objective without other players knowing.

#### Acceptance Criteria

1. WHEN the GamePhase transitions to RoleReveal, THE Server SHALL randomly assign exactly one Killer Role, exactly one Medic Role, and Civilian Roles to all remaining Players.
2. WHEN Roles are assigned, THE Server SHALL emit each Player's Role exclusively to that Player's Client via their individual Socket connection.
3. WHEN a Player's Client receives their Role assignment, THE Client SHALL display the assigned Role in a full-screen private reveal view containing the role name, the role's win condition, and the role's action during the Night Phase.
4. THE Client SHALL NOT transmit or display any other Player's Role at any time.
5. WHEN the Player taps a "Got it" confirmation button on the Role reveal screen, THE Client SHALL emit a role acknowledgement event to the Server.
6. WHEN the Server has received role acknowledgement from all Players, OR after a 60-second timeout, THE Server SHALL transition the GamePhase to Night and emit a `phaseChanged` event to all Players.

---

### Requirement 6: Night Phase — Killer Action

**User Story:** As the Killer, I want to secretly select a player to eliminate during the night, so that I can progress toward my win condition.

#### Acceptance Criteria

1. WHEN the GamePhase transitions to Night, THE Client assigned the Killer Role SHALL display a list of living Players excluding the Killer, and prompt the Killer to select one Player to kill.
2. WHEN the Killer selects a target and submits a `submitKill` event, THE Server SHALL record the kill target for Night_Actions resolution.
3. IF a `submitKill` event references a Player who is not alive or not in the Game, THEN THE Server SHALL reject the action and return a descriptive error message to the Client.
4. IF a `submitKill` event is submitted by a Player who does not hold the Killer Role, THEN THE Server SHALL reject the action and return a descriptive error message to the Client.
5. IF a `submitKill` event is received after a kill target has already been recorded for the current Night Phase, THEN THE Server SHALL reject the duplicate submission and return an error message indicating a kill has already been submitted.
6. WHEN the Killer's Socket disconnects during the Night Phase before a kill target has been recorded, THE Server SHALL automatically record a null kill target for the Killer and proceed with Night_Actions resolution as if no kill was submitted.

---

### Requirement 7: Night Phase — Medic Action

**User Story:** As the Medic, I want to secretly select a player to protect during the night, so that I can prevent an elimination.

#### Acceptance Criteria

1. WHEN the GamePhase transitions to Night, THE Client assigned the Medic Role SHALL display a list of all living Players including the Medic, and prompt the Medic to select one Player to save.
2. WHEN the Medic selects a target and submits a `submitSave` event, THE Server SHALL record the save target for Night_Actions resolution.
3. IF a `submitSave` event references a Player who is not alive, THEN THE Server SHALL reject the action and return a descriptive error message to the Client.
4. IF a `submitSave` event is submitted by a Player who does not hold the Medic Role, THEN THE Server SHALL reject the action and return a descriptive error message to the Client.
5. IF a `submitSave` event is received after a save target has already been recorded for the current Night Phase, THEN THE Server SHALL reject the duplicate submission and return an error message indicating a save has already been submitted.
6. WHEN the Medic's Socket disconnects during the Night Phase before a save target has been recorded, THE Server SHALL automatically record a null save target for the Medic and proceed with Night_Actions resolution as if no save was submitted.

---

### Requirement 8: Night Phase — Civilian Waiting Screen

**User Story:** As a Civilian, I want to see a waiting screen during the night, so that I am not excluded from the experience while night actions are submitted.

#### Acceptance Criteria

1. WHILE the GamePhase is Night and a Player holds the Civilian Role, THE Client SHALL display a cinematic sleeping screen with atmospheric text such as "Night falls… everyone is asleep."
2. WHEN both the Killer and Medic have submitted their Night_Actions, THE Server SHALL automatically advance the GamePhase to Morning.
3. THE Server SHALL advance the GamePhase to Morning after a configurable night timer expires (default 90 seconds), even if not all Night_Actions have been submitted.

---

### Requirement 9: Morning Narration

**User Story:** As a Player, I want to experience dramatic narration when morning arrives, so that the game feels cinematic and the night's outcome is revealed engagingly.

#### Acceptance Criteria

1. WHEN the GamePhase transitions to Morning, THE Server SHALL resolve Night_Actions by comparing the kill target and save target and determine whether the targeted Player is eliminated.
2. WHEN Night_Actions are resolved, THE Server SHALL emit a `morningNarration` event to all Players containing an ordered array of narrative segments and the outcome (elimination or save).
3. WHEN the kill target and save target are the same Player, THE Server SHALL record that Player as alive and include a "saved by the medic" narrative segment in the `morningNarration` event payload.
4. WHEN the kill target and save target are different Players, THE Server SHALL record the kill target as eliminated and include an elimination narrative segment in the `morningNarration` event payload.
5. WHEN the Killer did not submit a kill target, THE Server SHALL record no elimination and include a "the night passed quietly" narrative segment in the `morningNarration` event payload.
6. WHEN the Client receives the `morningNarration` event, THE Client SHALL display each narrative segment sequentially with a 1500ms delay between segments, beginning immediately upon receipt of the event.
7. THE `morningNarration` event payload SHALL NOT reveal the identity of the Killer or Medic to Players.
8. WHEN the Client has displayed the final narrative segment, THE Client SHALL emit a `narrationComplete` event to the Server.
9. WHEN the Server has received `narrationComplete` from all connected Players, OR after a 30-second timeout, THE Server SHALL transition the GamePhase to Discussion.

---

### Requirement 10: Discussion Phase

**User Story:** As a Player, I want a timed discussion phase after the morning narration, so that the group can deliberate before voting.

#### Acceptance Criteria

1. WHEN the GamePhase transitions to Discussion, THE Server SHALL start a configurable Discussion Phase timer with a valid range of 10 to 600 seconds and a default of 120 seconds.
2. WHILE the GamePhase is Discussion, THE Client SHALL display a countdown timer in MM:SS format updating at one-second intervals, and the list of all currently living Players by name.
3. WHEN the Discussion Phase timer expires, THE Server SHALL transition the GamePhase to Voting and emit a `votingOpened` event to all Players.
4. WHILE the GamePhase is Discussion, THE Client SHALL NOT include or display any real-time chat input or message feed.
5. WHILE the GamePhase is Discussion, THE Client SHALL display an enabled "Skip to Vote" button only to the Host.
6. WHEN the Host submits a `skipDiscussion` event, THE Server SHALL immediately cancel the Discussion Phase timer, transition the GamePhase to Voting, and emit a `votingOpened` event to all Players.
7. IF a `skipDiscussion` event is submitted by a non-Host Player, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.

---

### Requirement 11: Voting Phase

**User Story:** As a Player, I want to vote to eliminate a suspected player, so that the group can act on its suspicions.

#### Acceptance Criteria

1. WHEN the GamePhase is Voting, THE Client SHALL display the list of all living Players and prompt each living Player to submit a Vote for one Player.
2. WHEN a living Player submits a `submitVote` event with a valid target, THE Server SHALL record the Vote via the VoteManager.
3. IF a `submitVote` event references a Player who is not alive, THEN THE Server SHALL reject the Vote and return a descriptive error message.
4. IF a `submitVote` event is submitted by a Player who is not alive, THEN THE Server SHALL reject the Vote.
5. THE Server SHALL accept only one `submitVote` submission per living Player per Voting Phase; duplicate submissions SHALL be rejected with a descriptive error message.
6. WHEN all living Players have submitted Votes or the Voting Phase timer expires, THE Server SHALL tally all Votes via the VoteManager and emit a `voteResults` event to all Players.
7. THE Server SHALL set the Voting Phase timer to a configurable duration with a default of 60 seconds.

---

### Requirement 12: Vote Resolution and Elimination

**User Story:** As a Player, I want to see who was eliminated and their role revealed after voting, so that the outcome of the vote is transparent.

#### Acceptance Criteria

1. WHEN the VoteManager tallies Votes and there is no tie, THE Server SHALL eliminate the Player with the most Votes.
2. WHEN there is a tie in Votes between two or more Players, THE Server SHALL eliminate no Player that round and include a tie narrative in the `voteResults` event specifying that no elimination occurred.
3. WHEN a Player is eliminated, THE Server SHALL emit a `playerEliminated` event containing the eliminated Player's name and Role to all Players.
4. WHEN the Client receives a `playerEliminated` event, THE Client SHALL display the eliminated Player's name and Role within 2 seconds of receipt, in a full-screen reveal view visible to all Players.

---

### Requirement 19: Eliminated Player Spectator View

**User Story:** As an eliminated Player, I want to watch the rest of the game unfold, so that I can stay engaged without influencing the outcome.

#### Acceptance Criteria

1. WHEN a Player is eliminated (by night action or vote), THE Server SHALL mark that Player's status as eliminated and THE Client SHALL transition that Player to a spectator view.
2. WHILE a Player is in the spectator view, THE Client SHALL display all public game information including phase transitions, morning narration, vote results, and the list of living Players.
3. WHILE a Player is in the spectator view, THE Client SHALL NOT allow that Player to submit any game actions including `submitKill`, `submitSave`, `submitVote`, or `skipDiscussion`.
4. WHILE a Player is in the spectator view, THE Client SHALL display a persistent visual indicator that the Player has been eliminated and is spectating.
5. WHEN the GamePhase transitions to GameOver, THE Client SHALL transition all spectating Players to the Game Over screen alongside living Players.

---

### Requirement 13: Win Condition — Civilians Win

**User Story:** As a Civilian or Medic, I want the game to end when the Killer is eliminated, so that the town's victory is recognised.

#### Acceptance Criteria

1. WHEN a Player is eliminated, IF that Player holds the Killer Role, THEN THE Server SHALL transition the GamePhase to GameOver and emit a `gameOver` event with the outcome "Civilians Win", the full player list, and each Player's Role.
2. WHILE the GamePhase is GameOver and the outcome is "Civilians Win", THE Client SHALL display a game over screen showing the winning faction, a list of all Players and their Roles, and — for the Host — a "Play Again" button; non-Host Players SHALL see a "Waiting for host..." message in place of the button, within 3 seconds of receiving the `gameOver` event.
3. WHEN the Host selects "Play Again" on the Game Over screen, THE Client SHALL emit a `replayGame` event, THE Server SHALL reset the GamePhase to Lobby and emit a `roomUpdated` event to all connected Players.

---

### Requirement 14: Win Condition — Killer Wins

**User Story:** As the Killer, I want the game to end when I match or outnumber the remaining non-Killer players, so that the Killer's dominance is recognised.

#### Acceptance Criteria

1. WHEN a Player is eliminated, IF the number of living Players holding the Killer Role equals or exceeds the number of living Players not holding the Killer Role, THEN THE Server SHALL transition the GamePhase to GameOver and emit a `gameOver` event with the outcome "Killer Wins", the full player list, and each Player's final Role.
2. WHILE the GamePhase is GameOver and the outcome is "Killer Wins", THE Client SHALL display a game over screen showing the winning faction, a list of all Players and their Roles, and — for the Host — a "Play Again" button; non-Host Players SHALL see a "Waiting for host..." message in place of the button, within 3 seconds of receiving the `gameOver` event.
3. WHEN the Host selects "Play Again" on the Game Over screen, THE Client SHALL emit a `replayGame` event, THE Server SHALL reset the GamePhase to Lobby, clear all Game state, and emit a `roomUpdated` event to all connected Players.

---

### Requirement 15: Game Replay

**User Story:** As a Player, I want the option to play again after a game ends, so that the group can start a new session without leaving the room.

#### Acceptance Criteria

1. WHEN the Host on the Game Over screen selects "Play Again", THE Client SHALL emit a `replayGame` event to the Server.
2. WHEN the Server receives a `replayGame` event, THE Server SHALL clear all previous Game state including Roles, Night_Actions, Votes, eliminations, and alive status for all Players, and restore the GamePhase to Lobby.
3. WHEN the Room resets to Lobby, THE Server SHALL emit a `roomUpdated` event to all connected Players reflecting the fresh Lobby state with all Players restored as living participants.
4. IF a non-Host Player's Client emits a `replayGame` event, THEN THE Server SHALL reject the request and return an error message indicating insufficient permissions.

---

### Requirement 16: Real-Time Synchronisation

**User Story:** As a Player, I want all game state changes to be reflected on my device immediately, so that all players stay in sync throughout the game.

#### Acceptance Criteria

1. THE Server SHALL use Socket.io to maintain a persistent Socket connection with each Client for the duration of the Game.
2. WHEN any GamePhase transition occurs, THE Server SHALL emit a `phaseChanged` event to all Players in the Room containing the new GamePhase name and the current Room state snapshot.
3. WHEN a Player's Socket disconnects during an active Game, THE Server SHALL retain that Player's game state for up to 60 seconds and emit a `roomUpdated` event to remaining Players indicating the disconnection.
4. WHEN a disconnected Player reconnects within 60 seconds using the same Room_Code and player name, THE Server SHALL restore the Player's Role, alive status, and current GamePhase, and emit a `roomUpdated` event to all Players confirming the reconnection.
5. WHEN a disconnected Player's 60-second retention window expires without reconnection, THE Server SHALL remove that Player from the Room and emit a `roomUpdated` event to remaining Players.
6. THE Server SHALL be the single source of truth for all game state.
7. THE Client SHALL NOT compute game outcomes, phase transitions, or win conditions independently.

---

### Requirement 17: Mobile-First UI

**User Story:** As a Player using a smartphone, I want an interface optimised for my device, so that the game is easy to play on a small touch screen.

#### Acceptance Criteria

1. THE Client SHALL render a responsive layout optimised for viewport widths from 320px to 480px as the primary target, scaling gracefully to larger screens.
2. THE Client SHALL apply a dark theme as the default and only visual theme.
3. THE Client SHALL render all interactive controls, including buttons and player selection lists, with a minimum touch target size of 44x44 CSS pixels.
4. THE Client SHALL NOT require horizontal scrolling at any supported viewport width.

---

### Requirement 18: In-Memory Game State

**User Story:** As a developer, I want all game state stored in server memory, so that the MVP can be built and tested without a database dependency.

#### Acceptance Criteria

1. THE GameManager SHALL store all active Room and Game state in server memory as JavaScript objects or Maps.
2. THE Server SHALL NOT require a database connection to create, join, or play a Game.
3. WHEN the Server process is restarted, THE GameManager SHALL initialise with an empty state, requiring all Players to create or join a new Room.
