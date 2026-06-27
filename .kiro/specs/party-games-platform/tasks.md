# Implementation Plan: Party Games Platform

## Overview

This plan transforms the existing Mafia game into a multi-game party platform by: (1) extracting game-agnostic room/lobby infrastructure into a Platform Layer, (2) defining a GameModule interface that each game implements, (3) wrapping the existing Mafia logic as the first module, and (4) adding Truth or Dare, 2 Truths 1 Lie, and Spyfall as new modules. The implementation proceeds bottom-up: shared types and interfaces first, then Platform layer, then game modules, then client UI.

## Tasks

- [x] 1. Define shared types and Game Module interface
  - [x] 1.1 Create platform-level types in `server/src/types.ts`
    - Add `PlatformPhase` enum (Lobby, GameSelection, ActiveGame, GameResults)
    - Add `PlatformPlayer` interface (id, name, isHost, isConnected, disconnectedAt, color)
    - Add `PlatformRoom` interface (roomCode, hostId, players, platformPhase, activeGameId, createdAt)
    - Add `GameModuleConfig` interface (id, name, minPlayers, maxPlayers, description)
    - Add `GameModuleContext` interface (emitToRoom, emitToPlayer, signalGameOver, getPlayers)
    - Add `GameModule` interface (config, start, handleEvent, getState, handleDisconnect, end)
    - Remove or deprecate Mafia-specific types from this file (move to game module)
    - _Requirements: 3.2, 20.1, 20.5_

  - [x] 1.2 Create client platform store types in `client/src/store/types.ts`
    - Define `PlatformStore` interface with connection, room, game selection, and error state
    - Define `PlatformPlayer` client-side type mirroring server type
    - Define `GameModuleConfig` client-side type
    - _Requirements: 16.2, 2.7_

  - [x] 1.3 Create game-specific type files for each module
    - Create `server/src/games/truth-or-dare/types.ts` with Prompt, TruthOrDareState interfaces
    - Create `server/src/games/two-truths-one-lie/types.ts` with Statement, StatementSet, TwoTruthsOneLieState interfaces
    - Create `server/src/games/spyfall/types.ts` with SpyfallState interface and SPYFALL_LOCATIONS array (25 locations)
    - _Requirements: 5.3, 8.3, 11.5_

- [x] 2. Implement Platform Layer
  - [x] 2.1 Refactor `RoomManager` to be game-agnostic
    - Replace `GamePhase` references with `PlatformPhase`
    - Replace `Room` type with `PlatformRoom` using `platformPhase` field
    - Remove `gameState` from Room (game state now lives in GameModule instances)
    - Preserve existing room creation, join, host transfer, and name validation logic
    - _Requirements: 3.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Write property tests for RoomManager refactor
    - **Property 1: Room creation produces valid room for valid host names**
    - **Property 2: Room joining succeeds for valid player names**
    - **Property 3: Duplicate name rejection**
    - **Validates: Requirements 1.2, 1.3, 1.7**

  - [x] 2.3 Implement `Platform` class in `server/src/Platform.ts`
    - Implement constructor accepting Server and optional RoomManager
    - Implement `registerGame(gameId, factory, config)` to store game factories
    - Implement `getAvailableGames()` to return registered game configs
    - Implement `createRoom(playerName, socketId)` delegating to RoomManager
    - Implement `joinRoom(roomCode, playerName, socketId)` delegating to RoomManager
    - Implement `selectGame(roomCode, gameId, requesterId)` with host-only check and player count validation
    - Implement `handleGameEvent(roomCode, socketId, eventType, payload)` routing to active module
    - Implement `handleDisconnect(socketId)` with 60s retention timer
    - Implement `handleReconnect(roomCode, playerName, socketId)` restoring state
    - Implement `returnToGameSelection(roomCode, requesterId)` clearing game state
    - Implement `endSession(roomCode, requesterId)` terminating room
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 2.4, 2.5, 2.6, 15.2, 15.3, 16.3, 16.4, 16.5_

  - [x] 2.4 Write property tests for Platform class
    - **Property 4: Host-only action authorization**
    - **Property 5: Valid game selection loads module**
    - **Property 6: Unrecognized game ID rejection**
    - **Property 7: Player count enforcement per game**
    - **Property 8: Game over returns to GameSelection preserving players**
    - **Property 9: Game event routing to active module**
    - **Validates: Requirements 2.4, 2.5, 2.6, 2.8, 3.3, 3.4, 3.6**

  - [x] 2.5 Update `server/src/index.ts` Socket event router
    - Replace GameManager usage with Platform instance
    - Register all game module factories on Platform
    - Wire socket events: createRoom, joinRoom, selectGame, gameEvent, disconnect, reconnect
    - Wire platform actions: returnToGameSelection, endSession
    - Follow existing try/catch + callback error pattern
    - _Requirements: 16.1, 3.4, 2.3_

  - [x] 2.6 Write property test for disconnect/reconnect
    - **Property 25: Disconnect/reconnect round-trip preserves state**
    - **Validates: Requirements 16.3, 16.4**

- [x] 3. Checkpoint - Platform layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Mafia Game Module
  - [x] 4.1 Create `server/src/games/mafia/MafiaModule.ts`
    - Implement `GameModule` interface wrapping existing PhaseController and VoteManager
    - Move Mafia-specific types to `server/src/games/mafia/types.ts`
    - Implement `start()` initializing game with players from GameModuleContext
    - Implement `handleEvent()` routing Mafia socket events (nightAction, submitVote, etc.)
    - Implement `getState(socketId)` returning role-appropriate game state for reconnection
    - Implement `handleDisconnect(socketId)` handling player dropout mid-game
    - Implement `end()` clearing timers and state
    - Set config: minPlayers=4, maxPlayers=10
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 20.1, 20.2_

  - [x] 4.2 Write unit tests for MafiaModule
    - Test that module wraps existing logic without rule changes
    - Test start/handleEvent/getState/end lifecycle
    - Test handleDisconnect during active game
    - _Requirements: 4.1, 4.2_

- [x] 5. Implement Truth or Dare Game Module
  - [x] 5.1 Create `server/src/games/truth-or-dare/TruthOrDareModule.ts`
    - Implement `GameModule` interface
    - Implement `start()` transitioning to submission phase, initializing prompt pool
    - Implement `handleEvent()` for: submitPrompt, playerReady, spinWheel, choiceSelected, nextTurn, endGame
    - Validate prompt text (1-280 chars) on submitPrompt
    - Track per-player submission count and ready status
    - Require at least 1 prompt before allowing ready
    - Transition to play phase when all players ready
    - On spinWheel: randomly select player, emit wheelResult
    - On choiceSelected: select random prompt from matching category (fallback to other category if empty)
    - On nextTurn: reset turn state for new spin
    - On endGame: call signalGameOver (host-only)
    - Implement `getState()` for reconnection
    - Implement `handleDisconnect()` retaining submitted prompts
    - Implement `end()` cleaning up state
    - Set config: minPlayers=2, maxPlayers=10
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 7.4_

  - [x] 5.2 Write property tests for Truth or Dare
    - **Property 10: Prompt text validation (1-280 chars)**
    - **Property 11: Ready requires minimum one submission**
    - **Property 12: All-ready transition to play phase**
    - **Property 13: Wheel spin selects valid player**
    - **Property 14: Prompt category matching**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.7, 6.2, 6.5, 6.6**

  - [x] 5.3 Write unit tests for Truth or Dare
    - Test submission phase flow (submit, ready, transition)
    - Test play phase flow (spin, choice, prompt reveal, next)
    - Test endGame host-only enforcement
    - Test empty category fallback behavior
    - _Requirements: 5.1, 6.1, 6.8, 7.3_

- [x] 6. Implement 2 Truths 1 Lie Game Module
  - [x] 6.1 Create `server/src/games/two-truths-one-lie/TwoTruthsOneLieModule.ts`
    - Implement `GameModule` interface
    - Implement `start()` transitioning to submission phase
    - Implement `handleEvent()` for: submitStatements, submitLieVote, nextRound
    - Validate statement sets (exactly 3 statements, 1-200 chars each, exactly 1 lie)
    - Auto-transition to play phase when all players submitted
    - Present statements in shuffled order (different from submission order)
    - Accept one vote per player per round, reject duplicates
    - Start 45-second voting timer per round
    - On timer expiry or all votes in: reveal lie, award points, emit lieRevealed
    - Award +1 point for correct lie identification
    - Advance through all players' statement sets in presentation order
    - Emit gameOver with final scoreboard sorted descending when all rounds complete
    - Implement `getState()` for reconnection (hide lie during voting)
    - Implement `handleDisconnect()` (count as abstain in active votes)
    - Implement `end()` clearing timers
    - Set config: minPlayers=3, maxPlayers=10
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4_

  - [x] 6.2 Write property tests for 2 Truths 1 Lie
    - **Property 15: Statement set validation (3 statements, 1-200 chars, exactly 1 lie)**
    - **Property 16: Lie concealment until reveal**
    - **Property 17: Statement presentation order differs from submission**
    - **Property 18: Single vote per player per round**
    - **Property 19: Correct lie identification scores +1 point**
    - **Property 20: Final scoreboard sorted descending**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.7, 9.1, 9.4, 9.6, 9.8, 10.2, 10.4**

  - [x] 6.3 Write unit tests for 2 Truths 1 Lie
    - Test submission validation and auto-transition
    - Test voting timer expiry with partial votes
    - Test round advancement and game completion
    - Test score accumulation across rounds
    - _Requirements: 8.6, 9.5, 9.7, 10.1, 10.3_

- [x] 7. Implement Spyfall Game Module
  - [x] 7.1 Create `server/src/games/spyfall/SpyfallModule.ts`
    - Implement `GameModule` interface
    - Implement `start()`: randomly select spy, randomly select location, emit roleAssigned events
    - Non-spy players receive location; spy receives null location + all possible locations list
    - Implement `handleEvent()` for: selectTarget, answerComplete, callVote, submitVote, spyGuess
    - Implement question phase: track turn order, ensure equal turns per player
    - Start configurable round timer (default 480s)
    - On callVote or timer expiry: transition to voting phase
    - On voting: 30-second timer, tally votes, determine outcome (majority=accused, tie=spy wins)
    - If accused is spy: players win. If accused is not spy: spy wins
    - On spyGuess: compare to actual location, determine winner
    - Implement `getState(socketId)`: spy sees isSpy=true + allLocations, others see location + allLocations
    - Implement `handleDisconnect()`: skip disconnected questioner after 10s grace period, abstain from votes
    - Implement `end()` clearing round and vote timers
    - Set config: minPlayers=4, maxPlayers=10
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 14.1, 14.2, 14.3, 14.4, 14.5, 19.2, 19.3_

  - [x] 7.2 Write property tests for Spyfall
    - **Property 21: Spyfall role assignment and information hiding**
    - **Property 22: Spyfall turn order fairness**
    - **Property 23: Spyfall vote tally outcome**
    - **Property 24: Spy guess outcome**
    - **Property 26: Disconnected player abstains from voting**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.6, 12.4, 12.5, 13.6, 13.7, 13.8, 13.9, 14.4, 14.5, 19.3**

  - [x] 7.3 Write unit tests for Spyfall
    - Test role assignment with exactly 1 spy
    - Test turn advancement and equal distribution
    - Test timer expiry triggers voting
    - Test callVote immediately transitions to voting
    - Test spy guess correct/incorrect outcomes
    - Test disconnected questioner skip after 10s
    - _Requirements: 11.1, 12.1, 13.1, 13.4, 14.4, 14.5, 19.2_

- [x] 8. Checkpoint - All server game modules pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement disconnection handling across modules
  - [x] 9.1 Implement disconnection logic in Platform and modules
    - Platform: 60-second retention timer with auto-removal
    - Platform: host transfer on host disconnect during active game
    - Platform: emit roomUpdated on disconnect/reconnect/removal
    - Each module's handleDisconnect: game-specific behavior (skip turn, abstain, retain content)
    - _Requirements: 16.3, 16.4, 16.5, 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 9.2 Write property test for host disconnect transfer
    - **Property 27: Host disconnect transfers host during active game**
    - **Validates: Requirements 19.5, 3.5**

- [x] 10. Implement Client Platform Layer
  - [x] 10.1 Create platform store in `client/src/store/platformStore.ts`
    - Implement state management for: connection status, room, players, phase, available games, active game, results, errors
    - Handle socket events: roomUpdated, gameSelected, gamePhaseChanged, gameOver, error
    - Expose actions: createRoom, joinRoom, selectGame, returnToGameSelection, endSession
    - _Requirements: 16.2, 2.7_

  - [x] 10.2 Create client game UI registry in `client/src/games/registry.ts`
    - Define `GameUIModule` interface (id, component, icon)
    - Define `GameUIProps` interface (roomCode, players, myPlayerId, isHost)
    - Register all 4 game UI components
    - _Requirements: 20.3_

  - [x] 10.3 Update `client/src/App.tsx` to render based on platform phase
    - Replace existing Mafia-specific routing with platform phase router
    - Render LandingPage for no room
    - Render GameSelectionScreen for GameSelection phase
    - Render active game component (from registry) for ActiveGame phase
    - Render GameResultsScreen for GameResults phase
    - _Requirements: 1.1, 2.1, 15.1, 15.5_

  - [x] 10.4 Create `client/src/pages/LandingPage.tsx`
    - Form to create room (name input, 1-32 chars) or join room (room code + name, 1-20 chars)
    - Client-side validation with inline error messages
    - Emit createRoom/joinRoom via socket
    - Display server errors (room not found, room full, name taken)
    - Mobile-first layout, dark theme, 44px touch targets
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 17.1, 17.2, 17.3_

  - [x] 10.5 Create `client/src/pages/GameSelectionScreen.tsx`
    - Display all available games with name, description, min/max players
    - Show games as unavailable when player count insufficient
    - Host sees selectable game cards; non-host sees read-only list
    - Display player list, room code, host indicator
    - Emit selectGame on host selection
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_

  - [x] 10.6 Create `client/src/pages/GameResultsScreen.tsx`
    - Display game results payload from the completed game
    - Show "Play Again" and "End Session" buttons to host only
    - Show "Waiting for host..." to non-host players
    - Emit returnToGameSelection or endSession on host action
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 11. Implement Client Game UIs
  - [x] 11.1 Create `client/src/games/mafia/MafiaGame.tsx`
    - Move existing Mafia UI views (RoleReveal, Night, Morning, Discussion, Voting, GameOver) into games/mafia directory
    - Adapt to receive state via GameUIProps and platform socket events
    - Preserve all existing UI behavior
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 11.2 Create `client/src/games/truth-or-dare/TruthOrDareGame.tsx`
    - Submission phase UI: prompt text input, truth/dare toggle, submit button, ready button, player ready indicators
    - Play phase UI: spinning wheel animation, truth/dare choice buttons (selected player only), prompt display, "Next" button (host only), "End Game" button (host only)
    - Mobile-first with 44px touch targets, dark theme
    - Spinning wheel fits 320px viewport without overflow
    - _Requirements: 5.1, 5.2, 5.5, 5.8, 6.1, 6.3, 6.7, 6.8, 7.1, 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 11.3 Create `client/src/games/two-truths-one-lie/TwoTruthsOneLieGame.tsx`
    - Submission phase UI: 3 text inputs, lie marker (exactly 1), submit button
    - Play phase UI: presenter name, 3 shuffled statements, vote buttons (for non-presenter), voting timer, scoreboard
    - Reveal UI: highlight correct lie, show who guessed correctly, updated scores
    - Final scoreboard: ranked descending, winner highlighted
    - Mobile-first, dark theme
    - _Requirements: 8.1, 8.2, 9.2, 10.3, 10.4, 17.1, 17.2, 17.3_

  - [x] 11.4 Create `client/src/games/spyfall/SpyfallGame.tsx`
    - Role assignment UI: show location (non-spy) or "You are the Spy" + all locations list (spy)
    - Question phase UI: current questioner, current target, round timer (MM:SS), "Accuse" button, "Guess Location" button (spy only)
    - Voting UI: player list to vote on, voting timer
    - Game over UI: reveal spy identity, reveal location, show outcome
    - Timer formatted as MM:SS with zero-padding
    - _Requirements: 11.2, 11.3, 11.6, 12.2, 12.6, 13.3, 13.4, 13.5, 14.1, 14.2, 17.1, 17.2, 17.3_

  - [x] 11.5 Write property test for timer display format
    - **Property 28: Timer display format (MM:SS zero-padded)**
    - **Validates: Requirements 13.3**

- [x] 12. Checkpoint - All client components render and full integration works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Wire everything together and final integration
  - [x] 13.1 Register all game modules in server entry point
    - Import MafiaModule, TruthOrDareModule, TwoTruthsOneLieModule, SpyfallModule
    - Call platform.registerGame() for each with factory and config
    - Verify all socket event routing works end-to-end
    - _Requirements: 20.2, 20.4, 3.4_

  - [x] 13.2 Update client socket event handlers for platform events
    - Handle: roomUpdated, gameSelected, gamePhaseChanged, gameOver, error
    - Handle reconnection flow: rejoin room on socket reconnect
    - Wire platform store updates to socket events
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 13.3 Register all game UI modules in client registry
    - Import all 4 game components
    - Register in games/registry.ts with correct IDs matching server
    - Verify App.tsx renders correct game component based on activeGameId
    - _Requirements: 20.3_

- [x] 14. Final checkpoint - Full platform integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing Mafia game logic (PhaseController, VoteManager) is preserved without rule changes — only wrapped in the GameModule interface
- All state remains in-memory; no database is introduced
- The project uses `vitest` for testing and `fast-check` for property-based tests (both already in devDependencies)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5"] },
    { "id": 4, "tasks": ["2.6", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 5, "tasks": ["4.2", "5.2", "5.3", "6.2", "6.3", "7.2", "7.3"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3", "10.4", "10.5", "10.6"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 10, "tasks": ["11.5", "13.1", "13.2", "13.3"] }
  ]
}
```
