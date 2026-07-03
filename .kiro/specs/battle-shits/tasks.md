# Implementation Plan: Battle Shits

## Overview

Implement the Battle Shits game as a `GameModule` on the Party Games Platform. The server module handles all game logic (grid validation, turn management, win detection). The client renders an interactive placement grid and dual-grid battle view. Follow the same patterns as `TwoTruthsOneLieModule` and `SpyfallModule`.

## Tasks

- [x] 1. Create server-side types and core grid utilities
  - Create `server/src/games/battle-shits/types.ts` with `Cell`, `Column`, `Row`, `PoopType`, `Orientation`, `PlacedPoop`, `SideGrid`, `BattleShitsState`, `BattleShitsClientState`, and all constants (`POOP_SIZES`, `ALL_POOP_TYPES`)
  - Implement pure utility functions: `cellKey(cell)`, `computeOccupiedCells(startCell, orientation, size)`, `isInBounds(cell)`, `hasOverlap(cells, existing)`, `hasAdjacency(cells, existing)` in a `utils.ts` file
  - _Requirements: 3.2, 5.1, 8.1_

  - [x] 1.1 Write property tests for grid utilities
    - **Property 1: Valid Poop Placements Are Accepted; Invalid Are Rejected with Grid Unchanged**
    - Test `computeOccupiedCells` produces correct cell count for all poop types and orientations
    - Test `isInBounds` rejects out-of-bounds cells for all columns/rows
    - Test `hasOverlap` and `hasAdjacency` with generated cell sets
    - **Validates: Requirements 3.2, 3.3**

- [x] 2. Implement `BattleShitsModule` — initialization and placement phase
  - Create `server/src/games/battle-shits/BattleShitsModule.ts` implementing `GameModule`
  - Implement `config` with `id: "battle-shits"`, `name: "Battle Shits"`, `minPlayers: 2`, `maxPlayers: 4`
  - Implement `start(context)`: assign players to sides based on player count (1v1 vs 2v2 with random shuffle), initialize `SideGrid`s, emit `bsPhaseChanged` with `{ phase: "placement", teams, mode }`
  - Implement `handleEvent` routing for `placePoop` and `readyForBattle`
  - Implement `placePoop` handler: run validation chain (bounds → overlap → adjacency → size → uniqueness), emit `error` on failure, emit `poopPlaced` on success, auto-check `allSidesReady` after each placement
  - Implement `readyForBattle` handler: mark calling side as ready, check if all sides ready → `transitionToBattle()`
  - Implement `getState(socketId)` for placement phase: own poops + remaining piece types, never opponent positions
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.1–3.7_

  - [x] 2.1 Write property tests for placement validation
    - **Property 1: Valid Poop Placements Are Accepted; Invalid Are Rejected with Grid Unchanged**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 2.2 Write property tests for state concealment during placement
    - **Property 2: State Concealment — Opponent Un-hit Poop Positions Are Never Revealed**
    - Generate boards with arbitrary poop placements; verify `getState` for one side never includes the other side's poop cell coordinates
    - **Validates: Requirements 3.6, 8.1, 8.3**

  - [x] 2.3 Write property tests for own-grid completeness
    - **Property 8: Own Grid Completeness — getState Always Returns Full Own-Grid Data**
    - For any number of placed poops, verify `getState` returns all of them with correct cells
    - **Validates: Requirements 3.7, 8.2**

- [x] 3. Checkpoint — Ensure placement phase tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `BattleShitsModule` — battle phase core
  - Implement `transitionToBattle()`: randomly pick starting side, initialize `activeSideIndex` and `activeShooter`, start Turn Timer, emit `bsPhaseChanged` with `{ phase: "battle", activeShooter }`
  - Implement `handleEvent` routing for `flush`
  - Implement `flush` handler: validate active shooter + un-flushed cell, cancel timer, compute hit/miss, update `PlacedPoop.hitCells`, detect sunk, emit `flushResult` and optionally `poopSunk`, check win condition, call `advanceTurn()`
  - Implement `advanceTurn()`: flip `activeSideIndex`, advance `shooterIndex` within the new active side (round-robin), set `activeShooter`, restart timer, emit `bsTurnStarted`
  - Implement `endGame()`: emit `bsPhaseChanged` with `{ phase: "gameOver", winner, winnerPlayerIds }`, call `context.signalGameOver`
  - Update `getState(socketId)` for battle phase: censor opponent un-hit poop positions, include `outgoingMarkers` and `flushMarkers`
  - _Requirements: 4.1–4.4, 5.1–5.5, 7.1–7.3, 8.1–8.3_

  - [x] 4.1 Write property tests for turn alternation
    - **Property 3: Turn Alternation After Every Shot**
    - For any sequence of valid flushes, verify `activeSideIndex` alternates 0→1→0 every shot
    - **Validates: Requirements 4.2, 4.4**

  - [x] 4.2 Write property tests for 2v2 shooter rotation
    - **Property 4: 2v2 Active Shooter Rotation Within a Team**
    - For any 2v2 game, verify each team's active shooter cycles through all members in order
    - **Validates: Requirements 4.3**

  - [x] 4.3 Write property tests for flush result correctness
    - **Property 5: Flush Result Correctness — Hit, Miss, and Sunk Are Accurately Reported**
    - Generate boards and flush sequences; verify hit/miss matches cell occupancy, sunk field matches poop type
    - **Validates: Requirements 5.1, 5.4**

  - [x] 4.4 Write property tests for invalid flush rejection
    - **Property 6: Invalid Flush Attempts Are Always Rejected Without Side Effects**
    - Test flush from non-active-shooter, flush on already-flushed cell; verify error emitted and state unchanged
    - **Validates: Requirements 5.2, 5.3**

- [x] 5. Implement Turn Timer
  - Implement `startTurnTimer()`: `setTimeout(30_000)` with `setInterval` ticking every second emitting `bsTurnTimerUpdate`
  - Implement `clearTurnTimer()`: clear both `setTimeout` and `setInterval`
  - On timer expiry: emit `turnSkipped` then call `advanceTurn()`
  - _Requirements: 6.1–6.4_

- [x] 6. Implement win condition and state concealment in battle phase
  - After each flush, call `checkWinCondition(defenderSide)`: if all 4 poops are sunk, call `endGame()`
  - Verify `getState` for both players across random board states only reveals own poops and opponent flush markers
  - _Requirements: 7.1–7.3, 8.1–8.3_

  - [x] 6.1 Write property tests for win condition
    - **Property 7: Win Condition — Game Ends Exactly When All Four Opponent Poops Are Sunk**
    - Simulate hit sequences that progressively sink all poops; verify game ends only after the 4th poop is sunk
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 6.2 Write property tests for battle-phase state concealment
    - **Property 2: State Concealment — Opponent Un-hit Poop Positions Are Never Revealed**
    - During battle phase with partially hit boards, verify getState never leaks un-hit opponent cells
    - **Validates: Requirements 8.1, 8.3**

- [x] 7. Implement disconnect and player removal handling
  - Implement `handleDisconnect(socketId)`: no immediate action — timer continues; turn auto-skips on expiry (covered by existing timer logic)
  - Implement `handlePlayerRemoval(socketId)`: remove player from their side's `playerIds` rotation; if removed player is `activeShooter`, call `advanceTurn()` immediately
  - Implement `end()`: call `clearTurnTimer()`, set `context = null`
  - _Requirements: 9.1–9.5_

- [x] 8. Checkpoint — Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Register the game module on the server
  - In `server/src/index.ts`, add: `platform.registerGame("battle-shits", () => new BattleShitsModule(), new BattleShitsModule().config)`
  - Add the import for `BattleShitsModule`
  - _Requirements: 1.2_

- [x] 10. Create client-side types
  - Create `client/src/games/battle-shits/types.ts` mirroring the server-side `BattleShitsClientState`, `Cell`, `PoopType`, `Orientation`, `FlushMarker`, and event payload shapes
  - _Requirements: 10.1_

- [x] 11. Implement `PlacementPhase` client component
  - Create `client/src/games/battle-shits/BattleShitsGame.tsx` with top-level component and `PlacementPhase` sub-component
  - Render a 10×10 grid with column labels A–J and row labels 1–10; cells are rendered as buttons
  - Render piece tray showing unplaced Poop types with their sizes
  - Implement orientation toggle (horizontal / vertical) using local state
  - On piece selection + hover, compute preview cells and highlight green (valid) or red (invalid) using CSS classes
  - On cell click with valid piece selected: emit `gameEvent { type: "placePoop", data: { type, startCell, orientation } }`
  - Listen for `poopPlaced` to update local placed-poop state; listen for `error` to show toast
  - When all 4 poops placed, enable "Ready for Battle! 🚽" button that emits `gameEvent { type: "readyForBattle", data: {} }`
  - Listen for `bsReadyStatus` and show waiting indicator (which sides are ready)
  - _Requirements: 10.1–10.6_

- [x] 12. Implement `BattlePhase` client component
  - Add `BattlePhase` sub-component to `BattleShitsGame.tsx`
  - Render two grids: own grid (shows placed poops + received flush markers) and opponent grid (shows only sent flush markers)
  - Display Turn Timer countdown with color shift to red at ≤10s, listening to `bsTurnTimerUpdate`
  - When it is the player's turn (`activeShooter === myPlayerId`): enable opponent grid cells that have not been flushed; on click emit `gameEvent { type: "flush", data: { cell } }`
  - When not the player's turn: disable opponent grid, show "Waiting for {name}..." overlay
  - Listen for `flushResult`: update opponent grid with 💥 (hit) or 🌊 (miss)
  - Listen for `poopSunk`: display 💨 animation over the sunk poop's cells
  - Listen for `bsTurnStarted` to update active shooter and reset timer display
  - Listen for `turnSkipped` to show brief notification
  - _Requirements: 11.1–11.5_

- [x] 13. Implement `GameOverScreen` client component and socket event wiring
  - Add `GameOverScreen` sub-component showing winner, winning team members, and a poop-by-poop summary (sunk vs. surviving)
  - In top-level `BattleShitsGame`, wire all socket events: `bsPhaseChanged` (drives phase state), `bsTurnStarted`, `bsTurnTimerUpdate`, `flushResult`, `poopSunk`, `turnSkipped`
  - Register socket listeners in `useEffect`, clean up on unmount
  - Request initial state via `gameEvent { type: "getState" }` on mount for reconnection support
  - _Requirements: 11.6_

- [x] 14. Register the game UI on the client
  - In `client/src/games/registry.tsx`, add `import { BattleShitsGame } from "./battle-shits/BattleShitsGame"` and add `{ id: "battle-shits", component: BattleShitsGame, icon: "💩" }` to the `gameUIModules` array
  - _Requirements: 1.3_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "10"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5", "11"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7", "12"] },
    { "wave": 8, "tasks": ["8"] },
    { "wave": 9, "tasks": ["9", "13"] },
    { "wave": 10, "tasks": ["14"] },
    { "wave": 11, "tasks": ["15"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` (already a dependency) and `vitest` with fake timers, following the pattern in `TwoTruthsOneLieModule.test.ts`
- The `bsPhaseChanged` event prefix avoids colliding with the platform's `gamePhaseChanged` event
- All socket events follow the `gameEvent { type, data }` pattern; server emits use unique `bs`-prefixed event names
- The client should use the existing CSS variables (`--bg-secondary`, `--accent`, etc.) for consistent theming
