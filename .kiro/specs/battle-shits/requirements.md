# Requirements Document

## Introduction

Battle Shits is a poop/toilet-themed Battleship-style game added to the Party Games Platform. Two players (1v1) or four players split into two teams (2v2) secretly place "poops" (ships) on a 10×10 grid, then alternate turns "flushing" (attacking) coordinates on the opponent's grid. The first side to flush all opponent poops wins. The game is implemented as a `GameModule` in `server/src/games/battle-shits/` and a React UI in `client/src/games/battle-shits/`, following all existing platform conventions.

## Glossary

- **BattleShitsModule**: The server-side `GameModule` implementation for Battle Shits.
- **BattleShitsGame**: The client-side React component for Battle Shits.
- **Grid**: A 10×10 coordinate space with columns A–J and rows 1–10.
- **Cell**: A single coordinate on a Grid, identified by a column letter and a row number (e.g., "A1", "J10").
- **Poop**: A game piece occupying 2–5 consecutive Cells horizontally or vertically. Equivalent to a "ship" in Battleship.
- **Tiny Poop**: A Poop occupying exactly 2 Cells.
- **Regular Poop**: A Poop occupying exactly 3 Cells.
- **Big Poop**: A Poop occupying exactly 4 Cells.
- **Mega Poop**: A Poop occupying exactly 5 Cells.
- **Flush**: An attack action — a player targets a Cell on the opponent's Grid. Equivalent to "fire" in Battleship.
- **Hit**: A Flush that strikes a Cell occupied by a Poop.
- **Miss**: A Flush that strikes an empty Cell.
- **Sunk**: The state of a Poop when all of its Cells have been Hit.
- **Placement Phase**: The game phase during which each player/team privately places their Poops on their own Grid.
- **Battle Phase**: The game phase during which players alternate Flushing the opponent's Grid.
- **Team**: In 2v2 mode, a group of 2 players sharing one Grid and alternating shots.
- **Active Shooter**: The specific player within a Team whose turn it is to take a shot during the Battle Phase.
- **Turn Timer**: A 30-second countdown per shot during the Battle Phase; expires if the Active Shooter does not Flush a Cell.

## Requirements

### Requirement 1 — Game Registration

**User Story:** As a platform user, I want Battle Shits to appear in the game selection screen, so that I can start a session.

#### Acceptance Criteria

1. THE BattleShitsModule SHALL have a `config` with `id: "battle-shits"`, `name: "Battle Shits"`, `minPlayers: 2`, and `maxPlayers: 4`.
2. THE BattleShitsModule SHALL be registered with the Platform in `server/src/index.ts` so that it appears in the available games list.
3. THE BattleShitsGame SHALL be registered in `client/src/games/registry.tsx` with `id: "battle-shits"` and icon `"💩"`.

---

### Requirement 2 — Game Mode Selection

**User Story:** As a host, I want to choose between 1v1 and 2v2 modes at the start of the game, so that the right number of players can participate.

#### Acceptance Criteria

1. WHEN the BattleShitsModule starts with exactly 2 connected players, THE BattleShitsModule SHALL assign each player to their own individual Grid and operate in 1v1 mode.
2. WHEN the BattleShitsModule starts with exactly 3 or 4 connected players, THE BattleShitsModule SHALL randomly assign players into two Teams of equal or near-equal size (one team of 2 and one team of 2 for 4 players; one team of 2 and one team of 1 for 3 players) and operate in 2v2 mode.
3. WHEN the BattleShitsModule starts, THE BattleShitsModule SHALL emit a `bsPhaseChanged` event to the room with `{ phase: "placement", teams: [...], mode: "1v1" | "2v2" }`.

---

### Requirement 3 — Placement Phase

**User Story:** As a player, I want to secretly place my Poops on my Grid using an interactive UI, so that my opponent cannot see my layout.

#### Acceptance Criteria

1. DURING the Placement Phase, THE BattleShitsModule SHALL maintain a separate Grid per side (individual player in 1v1, Team in 2v2).
2. WHEN a player submits a `placePoop` event, THE BattleShitsModule SHALL validate that the placement satisfies all of the following constraints: (a) all Cells fall within columns A–J and rows 1–10, (b) the Poop does not overlap any already-placed Poop, (c) the Poop does not touch any already-placed Poop diagonally or orthogonally, (d) the Poop size matches the expected size for that piece type, (e) each piece type is placed at most once per side.
3. IF a `placePoop` event fails any validation, THEN THE BattleShitsModule SHALL emit an `error` event to that player with a descriptive message and leave the Grid unchanged.
4. WHEN a player has placed all 4 Poops and emits a `readyForBattle` event, THE BattleShitsModule SHALL mark that side as ready.
5. WHEN all sides are marked ready, THE BattleShitsModule SHALL transition to the Battle Phase and emit `bsPhaseChanged` with `{ phase: "battle", activeShooter: <playerId> }`.
6. THE BattleShitsModule SHALL send only the requesting player's own Grid layout via `getState`, never the opponent's Poop positions.
7. WHEN a player calls `getState` during the Placement Phase, THE BattleShitsModule SHALL return the player's current placed Poops and a list of the remaining piece types to place.

---

### Requirement 4 — Battle Phase Turn Order

**User Story:** As a player, I want turns to alternate fairly between sides, so that each side gets equal opportunity to attack.

#### Acceptance Criteria

1. WHEN the Battle Phase begins, THE BattleShitsModule SHALL randomly determine which side shoots first.
2. AFTER each completed shot (Hit, Miss, or auto-skip), THE BattleShitsModule SHALL transfer the turn to the opposing side.
3. WHILE in 2v2 mode, THE BattleShitsModule SHALL alternate the Active Shooter within a Team on each successive turn for that Team (Player A shoots, then Player B shoots on the next turn for that team, then Player A again, etc.).
4. THE BattleShitsModule SHALL emit a `bsTurnStarted` event with `{ activeShooter: <playerId>, timeRemaining: 30 }` at the start of each turn.

---

### Requirement 5 — Flushing (Attack Action)

**User Story:** As the Active Shooter, I want to tap a Cell on the opponent's grid to flush it, so that I can eliminate their Poops.

#### Acceptance Criteria

1. WHEN the Active Shooter emits a `flush` event with a valid, un-flushed Cell coordinate, THE BattleShitsModule SHALL record the Flush and respond with a `flushResult` event containing `{ cell, result: "hit" | "miss", sunk: <PoopType> | null }`.
2. IF the Active Shooter emits a `flush` event targeting a Cell that has already been Flushed, THEN THE BattleShitsModule SHALL emit an `error` event to that player and not advance the turn.
3. IF a player who is not the Active Shooter emits a `flush` event, THEN THE BattleShitsModule SHALL emit an `error` event to that player and not advance the turn.
4. WHEN a Flush results in a Hit that Sinks a Poop, THE BattleShitsModule SHALL include the Poop type in the `flushResult` `sunk` field and emit a `poopSunk` event to the room with `{ poopType, team: <sideId> }`.
5. WHEN a Flush is processed, THE BattleShitsModule SHALL cancel the active Turn Timer before advancing the turn.

---

### Requirement 6 — Turn Timer

**User Story:** As a player, I want turns to be time-limited, so that the game keeps moving and nobody stalls indefinitely.

#### Acceptance Criteria

1. WHEN a turn begins, THE BattleShitsModule SHALL start a 30-second Turn Timer for the Active Shooter.
2. WHEN the Turn Timer expires without a valid `flush` event from the Active Shooter, THE BattleShitsModule SHALL emit a `turnSkipped` event with `{ playerId: <activeShooter>, reason: "timeout" }` and advance the turn to the opposing side.
3. WHEN a valid `flush` event is received before the Turn Timer expires, THE BattleShitsModule SHALL cancel the timer before processing the shot.
4. THE BattleShitsModule SHALL emit a `bsTurnTimerUpdate` event each second with `{ timeRemaining: <seconds> }` while the Turn Timer is active.

---

### Requirement 7 — Win Condition

**User Story:** As a player, I want the game to end automatically when all opponent Poops are flushed, so that the winner is declared clearly.

#### Acceptance Criteria

1. AFTER each Hit, THE BattleShitsModule SHALL check whether all 4 of the opponent side's Poops are Sunk.
2. WHEN all 4 opponent Poops are Sunk, THE BattleShitsModule SHALL emit a `bsPhaseChanged` event with `{ phase: "gameOver", winner: <sideId>, winnerPlayerIds: [...] }`.
3. WHEN all 4 opponent Poops are Sunk, THE BattleShitsModule SHALL call `context.signalGameOver` with `{ game: "battle-shits", winner: <sideId>, winnerPlayerIds: [...] }`.

---

### Requirement 8 — Opponent Grid Visibility

**User Story:** As a player, I want to see the results of my shots on the opponent's grid, so that I can track my progress without seeing their hidden Poop layout.

#### Acceptance Criteria

1. WHEN a player calls `getState`, THE BattleShitsModule SHALL return the opponent's Grid showing only flushed Cells (hit or miss markers) and not the positions of un-hit Poop Cells.
2. WHEN a player calls `getState`, THE BattleShitsModule SHALL return the player's own Grid showing all placed Poop Cells and all received flush markers.
3. THE BattleShitsModule SHALL never include un-hit opponent Poop Cell positions in any room-wide event payload.

---

### Requirement 9 — Disconnect and Reconnect

**User Story:** As a player, I want to be able to reconnect if I lose connection, so that a temporary drop doesn't end the game.

#### Acceptance Criteria

1. WHEN a player disconnects during the Placement Phase, THE BattleShitsModule SHALL pause placement readiness evaluation for that side until the player reconnects or is removed.
2. WHEN a player disconnects while they are the Active Shooter during the Battle Phase, THE BattleShitsModule SHALL allow the Turn Timer to continue running; if the timer expires, THE BattleShitsModule SHALL auto-skip the turn as per Requirement 6.2.
3. WHEN a disconnected player reconnects, THE BattleShitsModule SHALL restore full game state to that player via `getState`.
4. WHEN `handlePlayerRemoval` is called for the Active Shooter, THE BattleShitsModule SHALL immediately skip that player's turn and advance to the opposing side.
5. WHEN `handlePlayerRemoval` is called for any player, THE BattleShitsModule SHALL remove that player from their Team's Active Shooter rotation.

---

### Requirement 10 — Client UI: Placement Phase

**User Story:** As a player, I want an interactive grid UI for placing my Poops, so that setup is intuitive and visual.

#### Acceptance Criteria

1. THE BattleShitsGame SHALL render a 10×10 Grid with column labels A–J and row labels 1–10.
2. WHEN a player selects a Poop piece type from the piece tray, THE BattleShitsGame SHALL highlight valid placement Cells on the Grid as the player hovers.
3. WHEN a player clicks a valid Cell with a piece selected, THE BattleShitsGame SHALL place that Poop on the Grid and emit a `placePoop` socket event.
4. THE BattleShitsGame SHALL provide a toggle to switch Poop orientation between horizontal and vertical before placement.
5. WHEN all 4 Poops are placed, THE BattleShitsGame SHALL enable a "Ready for Battle! 🚽" button that emits a `readyForBattle` event.
6. WHILE waiting for the opponent to finish placement, THE BattleShitsGame SHALL display a waiting indicator showing which sides are ready.

---

### Requirement 11 — Client UI: Battle Phase

**User Story:** As the Active Shooter, I want to tap the opponent's grid to flush a coordinate, so that the interaction is clear and immediate.

#### Acceptance Criteria

1. THE BattleShitsGame SHALL render two Grids side by side (or stacked on mobile): the player's own Grid and the opponent's attack Grid.
2. WHEN it is the player's turn, THE BattleShitsGame SHALL enable tapping/clicking Cells on the opponent's Grid and display the Turn Timer countdown.
3. WHEN it is not the player's turn, THE BattleShitsGame SHALL disable the opponent's Grid and show whose turn it is.
4. WHEN a `flushResult` event is received, THE BattleShitsGame SHALL update the opponent's Grid to show 💥 for a Hit or 🌊 for a Miss at the targeted Cell.
5. WHEN a `poopSunk` event is received, THE BattleShitsGame SHALL display a 💨 "Flushed!" animation for that Poop.
6. WHEN a `bsPhaseChanged` event with `phase: "gameOver"` is received, THE BattleShitsGame SHALL display a game-over screen showing the winner and a summary of remaining/sunk Poops.
