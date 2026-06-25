# Implementation Plan: Mafia Companion Web App

## Overview

Implement a real-time, mobile-first social deduction game using Node.js + Socket.io + Express on the server and React + Socket.io-client on the client. All game state is stored in-memory. The server is the single source of truth; clients only display state and submit actions. Implementation proceeds bottom-up: shared types → server core modules → Socket.io event layer → React UI components → testing.

## Tasks

- [x] 1. Set up project structure, shared types, and tooling
  - [x] 1.1 Initialise monorepo with `server/` and `client/` packages, configure TypeScript for both, add Vitest + fast-check to server
    - Create `package.json` at root with workspaces for `server` and `client`
    - Add `tsconfig.json` for each package targeting Node 18 (server) and ESNext + DOM (client)
    - Install `vitest`, `fast-check`, `@types/node`, `express`, `socket.io` in server; `react`, `react-dom`, `socket.io-client`, `vite`, `@vitejs/plugin-react` in client
    - _Requirements: 18.1, 18.2_

  - [x] 1.2 Define all shared TypeScript interfaces and enums in `server/src/types.ts`
    - Implement `GamePhase` enum, `Role` enum, `Player`, `Room`, `GameState`, `NarrationResult`, `VoteResult`, `WinCondition` interfaces exactly as specified in the design document
    - Export all types for use across server modules
    - _Requirements: 18.1_

- [x] 2. Implement RoomManager
  - [x] 2.1 Implement `RoomManager` class in `server/src/RoomManager.ts`
    - Implement `generateRoomCode()` — uppercase alphanumeric, 6 chars, up to 10 collision attempts; return `null` on failure
    - Implement `createRoom(hostName, socketId)` — validates host name (1–32 chars), calls `generateRoomCode`, throws on failure
    - Implement `addPlayer(room, playerName, socketId)` — validates name (1–20 chars), uniqueness, room capacity (max 10), phase is Lobby
    - Implement `removePlayer(room, playerId)`
    - Implement `isNameUnique(room, playerName)` — case-sensitive check
    - Implement `transferHost(room)` — promotes next connected player, emits nothing (caller emits)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.1, 2.3, 2.6, 2.7, 3.6_

  - [x] 2.2 Write property tests for RoomManager — Property 1 (valid room creation produces valid room code)
    - **Property 1: Valid room creation produces valid room code**
    - **Validates: Requirements 1.1, 1.3**
    - Use `fc.string({ minLength: 1, maxLength: 32 })` as host name generator; assert room code matches `/^[A-Z0-9]{6}$/` and creator is host

  - [x] 2.3 Write property tests for RoomManager — Property 2 (invalid room creator names are rejected)
    - **Property 2: Invalid room creator names are rejected**
    - **Validates: Requirements 1.4**
    - Generate empty strings, strings > 32 chars, null; assert `createRoom` throws with descriptive error

  - [x] 2.4 Write property tests for RoomManager — Property 3 (valid join adds player to room)
    - **Property 3: Valid join adds player to room**
    - **Validates: Requirements 2.1, 2.7**
    - Generate rooms in Lobby with 1–9 existing players and a fresh unique name; assert player added and room player count increments

  - [x] 2.5 Write property tests for RoomManager — Property 4 (invalid join names are rejected)
    - **Property 4: Invalid join names are rejected**
    - **Validates: Requirements 2.3**
    - Generate empty strings and strings > 20 chars; assert `addPlayer` throws with descriptive error

  - [x] 2.6 Write property tests for RoomManager — Property 5 (nonexistent room codes are rejected)
    - **Property 5: Nonexistent room codes are rejected**
    - **Validates: Requirements 2.2**
    - Generate random 6-char codes not in the room store; assert lookup returns null/error

  - [x] 2.7 Write property tests for RoomManager — Property 6 (duplicate names are rejected)
    - **Property 6: Duplicate names in room are rejected**
    - **Validates: Requirements 2.7**
    - Generate a room with player name X; attempt to add player with identical name X; assert rejection

  - [x] 2.8 Write property tests for RoomManager — Property 9 (host disconnect transfers host)
    - **Property 9: Host disconnect in Lobby transfers host**
    - **Validates: Requirements 3.6**
    - Generate rooms with 2–10 connected players; simulate host disconnect; assert new host is a connected player and is different from original host

- [x] 3. Implement VoteManager
  - [x] 3.1 Implement `VoteManager` class in `server/src/VoteManager.ts`
    - Implement `recordVote(room, voterId, targetId)` — validates voter is alive, target is alive, voter has not already voted; store in `gameState.votes`
    - Implement `hasVoted(room, voterId)` — check `gameState.votes` map
    - Implement `tallyVotes(room)` — count votes per target, find max; return `VoteResult` with `eliminatedPlayerId`, `voteCounts`, `isTie`, `tiedPlayers`
    - Implement `clearVotes(room)` — reset `gameState.votes`
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2_

  - [x] 3.2 Write property tests for VoteManager — Property 29 (vote submission validates target is alive)
    - **Property 29: Vote submission validates target is alive**
    - **Validates: Requirements 11.3**
    - Generate game states with eliminated players; assert `recordVote` targeting a dead player is rejected

  - [x] 3.3 Write property tests for VoteManager — Property 30 (dead players cannot vote)
    - **Property 30: Dead players cannot vote**
    - **Validates: Requirements 11.4**
    - Generate eliminated player IDs as voter; assert `recordVote` is rejected

  - [x] 3.4 Write property tests for VoteManager — Property 31 (duplicate votes are rejected)
    - **Property 31: Duplicate votes are rejected**
    - **Validates: Requirements 11.5**
    - Record a vote for player P, then attempt a second `recordVote` from the same voter; assert second call is rejected

  - [x] 3.5 Write property tests for VoteManager — Property 32 (vote tallying produces correct winner)
    - **Property 32: Vote tallying produces correct winner**
    - **Validates: Requirements 12.1**
    - Generate vote distributions where one player has strictly more votes; assert `tallyVotes` returns that player as `eliminatedPlayerId`

  - [x] 3.6 Write property tests for VoteManager — Property 33 (vote tie produces no elimination)
    - **Property 33: Vote tie produces no elimination**
    - **Validates: Requirements 12.2**
    - Generate tied vote distributions; assert `tallyVotes` returns `isTie: true` and `eliminatedPlayerId: null`

- [x] 4. Implement PhaseController
  - [x] 4.1 Implement role assignment in `server/src/PhaseController.ts`
    - Implement `assignRoles(room)` — shuffle player array, assign exactly 1 Killer, 1 Medic, rest Civilians; store on each Player object
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Write property tests for PhaseController — Property 13 (role assignment produces exactly 1 Killer, 1 Medic, N-2 Civilians)
    - **Property 13: Role assignment produces exactly 1 Killer, 1 Medic, and remaining Civilians**
    - **Validates: Requirements 5.1**
    - Use `fc.integer({ min: 4, max: 10 })` as player count generator; assert role counts match invariant for 100+ runs

  - [x] 4.3 Implement night action resolution in `PhaseController`
    - Implement `resolveNightActions(room)` — compare `killTarget` vs `saveTarget`; return `NarrationResult` with segments and `eliminatedPlayerId`
    - Handle all three cases: saved (K==S), eliminated (K≠S, K non-null), quiet night (K==null)
    - Narration segments must not reveal Killer or Medic identity
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.7_

  - [x] 4.4 Write property tests for PhaseController — Property 24 (night action resolution follows kill-save logic)
    - **Property 24: Night action resolution follows kill-save logic**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5**
    - Generate all combinations of `killTarget` (null or player ID) and `saveTarget` (null or player ID); assert correct outcome for each combination

  - [x] 4.5 Write property tests for PhaseController — Property 25 (morning narration does not reveal role identities)
    - **Property 25: Morning narration does not reveal role identities**
    - **Validates: Requirements 9.7**
    - Generate random player names for Killer and Medic; assert no narration segment contains those names or any role identifier

  - [x] 4.6 Implement win condition checks in `PhaseController`
    - Implement `checkWinCondition(room)` — after any elimination, check: if eliminated player is Killer → "Civilians Win"; if living Killers ≥ living non-Killers → "Killer Wins"; else null
    - _Requirements: 13.1, 14.1_

  - [x] 4.7 Write property tests for PhaseController — Property 34 (Killer elimination triggers Civilians Win)
    - **Property 34: Killer elimination triggers Civilians Win**
    - **Validates: Requirements 13.1**
    - Generate game states where the Killer is the eliminated player; assert `checkWinCondition` returns "Civilians Win"

  - [x] 4.8 Write property tests for PhaseController — Property 35 (Killer dominance triggers Killer Wins)
    - **Property 35: Killer dominance triggers Killer Wins**
    - **Validates: Requirements 14.1**
    - Generate game states where living Killers ≥ living non-Killers; assert `checkWinCondition` returns "Killer Wins"

  - [x] 4.9 Implement phase transitions and timers in `PhaseController`
    - Implement `transitionTo(room, phase)` — update `room.phase`, cancel existing timer, start new timer if applicable
    - Implement `startPhaseTimer(room, phase, duration)` with configurable durations: Night 90s, Discussion 120s (range 10–600s), Voting 60s, RoleReveal 60s, narration 30s
    - Implement `cancelPhaseTimer(room)`
    - _Requirements: 5.6, 8.2, 8.3, 9.9, 10.1, 10.3, 11.6, 11.7_

  - [x] 4.10 Write property tests for PhaseController — Property 15 (role acknowledgement advances phase)
    - **Property 15: Role acknowledgement advances phase**
    - **Validates: Requirements 5.6**
    - Generate rooms in RoleReveal; simulate all players acknowledging; assert phase transitions to Night

  - [x] 4.11 Write property tests for PhaseController — Property 23 (both night actions submitted advances to Morning)
    - **Property 23: Both night actions submitted advances to Morning**
    - **Validates: Requirements 8.2**
    - Generate rooms in Night phase; simulate Killer and Medic submitting actions; assert phase transitions to Morning

  - [x] 4.12 Write property tests for PhaseController — Property 26 (narration completion advances phase)
    - **Property 26: Narration completion advances phase**
    - **Validates: Requirements 9.9**
    - Generate rooms in Morning phase; simulate all players emitting `narrationComplete`; assert phase transitions to Discussion

  - [x] 4.13 Write property tests for PhaseController — Property 37 (phase transitions emit phaseChanged)
    - **Property 37: Phase transitions emit phaseChanged**
    - **Validates: Requirements 16.2**
    - Wrap `transitionTo` with a mock emitter; assert `phaseChanged` event is emitted with correct phase name and room snapshot for every phase transition

- [x] 5. Checkpoint — run all server unit and property tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement GameManager and Socket.io event layer
  - [x] 6.1 Implement `GameManager` class in `server/src/GameManager.ts`
    - Use `Map<string, Room>` as the room store; compose `RoomManager`, `VoteManager`, `PhaseController`
    - Implement `createRoom(playerName, socketId)`, `joinRoom(roomCode, playerName, socketId)`, `startGame(roomCode, requesterId)`, `getRoom(roomCode)`
    - Implement `handleDisconnect(playerId)` — mark player `isConnected: false`, set `disconnectedAt`, schedule 60s removal timer, transfer host if needed in Lobby
    - Implement `handleReconnect(roomCode, playerName, socketId)` — find player by name, cancel removal timer, restore socket ID, emit `roomUpdated`
    - _Requirements: 1.1–1.6, 2.1–2.7, 4.1–4.4, 15.2, 15.3, 16.3–16.5_

  - [x] 6.2 Write property tests for GameManager — Property 7 (join/leave events trigger roomUpdated)
    - **Property 7: Join/leave events trigger roomUpdated**
    - **Validates: Requirements 3.2**
    - Generate a sequence of join and leave operations on a room; assert a `roomUpdated` event is emitted after each operation

  - [x] 6.3 Write property tests for GameManager — Property 8 (start button availability depends on player count)
    - **Property 8: Start button availability depends on player count**
    - **Validates: Requirements 3.4, 3.5**
    - Generate rooms with 1–10 players; assert `startGame` succeeds iff player count is 4–10

  - [x] 6.4 Write property tests for GameManager — Property 10 (valid startGame transitions to RoleReveal)
    - **Property 10: Valid startGame transitions to RoleReveal**
    - **Validates: Requirements 4.1**
    - Generate rooms in Lobby with 4–10 players; assert `startGame` by host transitions phase to RoleReveal and emits `gameStarted`

  - [x] 6.5 Write property tests for GameManager — Property 11 (non-host startGame is rejected)
    - **Property 11: Non-host startGame is rejected**
    - **Validates: Requirements 4.3**
    - Generate non-host player IDs; assert `startGame` with non-host requester ID is rejected with permissions error

  - [x] 6.6 Write property tests for GameManager — Property 12 (startGame outside Lobby is rejected)
    - **Property 12: StartGame outside Lobby is rejected**
    - **Validates: Requirements 4.4**
    - Generate rooms in any non-Lobby phase; assert `startGame` is rejected with "already in progress" error

  - [x] 6.7 Write property tests for GameManager — Property 38 (player disconnect preserves state for 60 seconds)
    - **Property 38: Player disconnect preserves state for 60 seconds**
    - **Validates: Requirements 16.3**
    - Simulate disconnect; assert player's role and alive status are preserved immediately after disconnect and after 59 seconds

  - [x] 6.8 Write property tests for GameManager — Property 39 (reconnect within window restores state)
    - **Property 39: Reconnect within window restores state**
    - **Validates: Requirements 16.4**
    - Simulate disconnect then reconnect within 60s; assert player's role, alive status, and phase are restored

  - [x] 6.9 Wire Socket.io event handlers in `server/src/index.ts`
    - Set up Express + Socket.io server; attach handlers for all client events: `createRoom`, `joinRoom`, `startGame`, `submitKill`, `submitSave`, `submitVote`, `skipDiscussion`, `replayGame`, `roleAcknowledged`, `narrationComplete`
    - Each handler: validate inputs, delegate to `GameManager`/`VoteManager`/`PhaseController`, emit appropriate server events or structured error `{ success: false, error: "..." }`
    - Validate all night actions: authorize by role and alive status, check phase is Night, reject duplicates
    - Validate `skipDiscussion`: only host in Discussion phase
    - Validate `submitVote`: voter and target must be alive, no duplicate votes
    - Handle `replayGame`: only host in GameOver phase; reset all game state and return to Lobby
    - _Requirements: 5.2, 5.5, 6.1–6.6, 7.1–7.6, 8.2, 8.3, 10.6, 10.7, 11.1–11.6, 15.1–15.4, 16.1_

  - [x] 6.10 Write property tests for authorization — Properties 18, 22, 28, 41
    - **Property 18: Non-Killer submitKill is rejected**
    - **Property 22: Non-Medic submitSave is rejected**
    - **Property 28: Non-host skipDiscussion is rejected**
    - **Property 41: Spectator actions are rejected**
    - **Validates: Requirements 6.4, 7.4, 10.7, 19.3**
    - Generate player roles and host flags; assert each unauthorized action is rejected with a descriptive error

  - [x] 6.11 Write property tests for night actions — Properties 17, 19, 20, 21
    - **Property 17: Invalid kill targets are rejected**
    - **Property 19: Duplicate night action submissions are rejected**
    - **Property 20: Medic target list includes self**
    - **Property 21: Invalid save targets are rejected**
    - **Validates: Requirements 6.3, 6.5, 7.1, 7.3, 7.5**
    - Generate dead player IDs as targets; generate duplicate submissions; assert proper rejection in each case

- [x] 7. Checkpoint — run full server test suite
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement React client — core infrastructure
  - [x] 8.1 Scaffold React app in `client/` with Vite, set up global dark theme CSS and mobile-first base styles
    - Create `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`
    - Implement CSS custom properties for dark theme (background `#1a1a1a`, text `#f0f0f0`, accent colours)
    - Set `min-height: 100vh`, `box-sizing: border-box`, `touch-action: manipulation` on root
    - Ensure no horizontal scrolling at 320px viewport width
    - _Requirements: 17.1, 17.2, 17.4_

  - [x] 8.2 Implement Socket.io client wrapper and global state in `client/src/socket.ts` and `client/src/store.ts`
    - Create a singleton Socket.io-client instance with auto-reconnect and exponential backoff (1s, 2s, 4s, 8s, max 15s)
    - Display "Connection lost" modal on disconnect; redirect to home after 60s
    - Implement React context/store holding: `roomCode`, `phase`, `myPlayer`, `players`, `role`, `error`
    - Register listeners for all server events: `roomUpdated`, `gameStarted`, `roleAssigned`, `phaseChanged`, `morningNarration`, `votingOpened`, `voteResults`, `playerEliminated`, `gameOver`, `error`
    - Never compute game logic locally; only store server-provided state
    - _Requirements: 16.1, 16.3, 16.4, 16.7_

- [x] 9. Implement React client — Lobby and Room views
  - [x] 9.1 Implement `HomeView` component — create and join room forms
    - Name input with inline validation error (empty / too long)
    - Room code input with inline validation error (not found / invalid format)
    - "Create Room" and "Join Room" buttons; minimum 44×44px touch targets
    - Emit `createRoom` / `joinRoom` on submit; display server error via toast if rejected
    - _Requirements: 1.1, 1.4, 2.1, 2.3, 17.3_

  - [x] 9.2 Implement `LobbyView` component
    - Display Room_Code prominently, player list with host indicator (crown icon or "(Host)" label)
    - Host sees "Start Game" button (enabled ≥4 players, disabled with helper text <4 players); non-host players do not see button
    - Update player list reactively on `roomUpdated` without page refresh
    - All interactive controls ≥44×44px
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 10. Implement React client — Game phase views
  - [x] 10.1 Implement `RoleRevealView` component
    - Full-screen card showing role name, win condition, and night action description
    - "Got it" button (≥44×44px); emit `roleAcknowledged` on press
    - Do not display any other player's role
    - _Requirements: 5.3, 5.4, 5.5_

  - [x] 10.2 Implement `NightView` component with role-specific sub-views
    - Killer sub-view: list of living players excluding self; each row is a selectable target (≥44×44px); "Submit Kill" button; emit `submitKill`
    - Medic sub-view: list of living players including self; each row is a selectable target (≥44×44px); "Submit Save" button; emit `submitSave`
    - Civilian sub-view: cinematic sleeping screen with atmospheric text ("Night falls… everyone is asleep.")
    - _Requirements: 6.1, 7.1, 8.1_

  - [x] 10.3 Implement `MorningView` component
    - Display narrative segments sequentially, 1500ms delay between each
    - Begin immediately on receipt of `morningNarration` event
    - Emit `narrationComplete` after displaying final segment
    - _Requirements: 9.6, 9.8_

  - [x] 10.4 Implement `DiscussionView` component
    - Countdown timer in MM:SS format updating every second
    - List of living players by name
    - Host sees "Skip to Vote" button (≥44×44px); emit `skipDiscussion` on press
    - No chat input or message feed
    - _Requirements: 10.2, 10.4, 10.5_

  - [x] 10.5 Write unit tests for `DiscussionView` timer formatting — Property 27
    - **Property 27: Discussion timer format is correct**
    - **Validates: Requirements 10.2**
    - Use fast-check `fc.integer({ min: 0, max: 600 })`; assert displayed string matches `MM:SS` format with correct values and zero-padding

  - [x] 10.6 Implement `VotingView` component
    - List of living players as selectable vote targets (≥44×44px rows)
    - "Submit Vote" button; emit `submitVote`; show confirmation on submission
    - Display vote countdown timer (MM:SS)
    - _Requirements: 11.1_

  - [x] 10.7 Implement `ResultsView` component
    - Full-screen reveal of eliminated player's name and role
    - Display within 2 seconds of `playerEliminated` event
    - Auto-dismiss after brief display
    - _Requirements: 12.3, 12.4_

  - [x] 10.8 Implement `GameOverView` component
    - Winner announcement banner ("Civilians Win" / "Killer Wins")
    - Full list of all players with their roles revealed
    - Host sees "Play Again" button (≥44×44px); emit `replayGame` on press
    - Non-host players see "Waiting for host..." message in place of button
    - Render within 3 seconds of `gameOver` event
    - _Requirements: 13.2, 13.3, 14.2, 14.3_

  - [x] 10.9 Implement `SpectatorView` component
    - Persistent "ELIMINATED — You are spectating" banner at top of screen
    - Passthrough display of public game info: current phase, living players, narration text, vote results
    - All action buttons disabled / absent
    - Transitions to `GameOverView` on `gameOver` event
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 11. Wire client phase routing
  - [x] 11.1 Implement phase router in `App.tsx` — render correct view based on `phase` in store
    - Map each `GamePhase` enum value to its corresponding view component
    - Handle eliminated player: if `myPlayer.isAlive === false` and phase is not GameOver, render `SpectatorView`
    - Handle error toast: subscribe to `error` events; display toast notification for 3 seconds; never silently fail
    - _Requirements: 16.2, 19.1_

- [x] 12. Checkpoint — end-to-end client + server smoke test
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement reconnection and error handling
  - [x] 13.1 Implement player reconnection flow on the server
    - On `joinRoom` with matching name and room code for a disconnected player within 60s: cancel removal timer, restore socket, emit `roomUpdated` and `phaseChanged` with current state
    - On `joinRoom` after 60s expiry: treat as a new join attempt (may fail if game in progress)
    - _Requirements: 16.3, 16.4, 16.5_

  - [x] 13.2 Implement client reconnection UI
    - On socket `disconnect` event: display "Connection lost" modal with spinner and "Retry" button
    - On socket `reconnect` event: hide modal; client state is refreshed via `phaseChanged` from server
    - After 60s without reconnection: display "Session expired" and redirect to home
    - _Requirements: 16.3, 16.4_

- [x] 14. Final checkpoint — full test suite
  - Ensure all unit, property, and integration tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- All property tests use `fast-check` with a minimum of 100 iterations per property
- Each property test includes the comment tag: `// Feature: mafia-game, Property X: [property text]`
- Failed test seeds are saved for reproducibility via Vitest's snapshot mechanism
- All server actions validate `GamePhase` and player authorization before execution
- Timers are stored on `GameState.phaseTimer` and cancelled on every `transitionTo` call to prevent phantom transitions
- The `morningNarration` payload never contains Killer or Medic player names or role labels
- Property tests 14 and 16 (role privacy, Killer target list) are verified via unit tests covering the `roleAssigned` emission logic and the target-list construction function respectively

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "3.2", "3.3", "3.4", "3.5", "3.6", "4.2", "4.3"] },
    { "id": 3, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["4.7", "4.8", "4.9"] },
    { "id": 5, "tasks": ["4.10", "4.11", "4.12", "4.13", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 7, "tasks": ["6.10", "6.11", "8.1", "8.2"] },
    { "id": 8, "tasks": ["9.1", "9.2"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.6", "10.7", "10.8", "10.9"] },
    { "id": 10, "tasks": ["10.5", "11.1"] },
    { "id": 11, "tasks": ["13.1", "13.2"] }
  ]
}
```
