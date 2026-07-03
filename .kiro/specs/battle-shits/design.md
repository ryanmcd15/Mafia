# Design Document — Battle Shits

## Overview

Battle Shits is a Battleship-style game with a poop/toilet theme, implemented as a `GameModule` on the Party Games Platform. It supports 1v1 (2 players) and 2v2 (4 players, random team assignment) modes. Players place Poops on a private 10×10 grid during a Placement Phase, then alternate Flushing coordinates on the opponent's grid during a Battle Phase. The first side to sink all four opponent Poops wins.

The implementation follows the exact same patterns as `TwoTruthsOneLieModule` and `SpyfallModule`:
- Server: `server/src/games/battle-shits/BattleShitsModule.ts` implementing `GameModule`
- Client: `client/src/games/battle-shits/BattleShitsGame.tsx` implementing `GameUIProps`
- Types: `server/src/games/battle-shits/types.ts` and a mirrored client-side types file
- Tests: `BattleShitsModule.test.ts` (property tests using `fast-check`) and `BattleShitsModule.unit.test.ts`

---

## Architecture

```
Platform (index.ts)
  └── registers BattleShitsModule factory

BattleShitsModule (GameModule)
  ├── start(context)          — team assignment, emit bsPhaseChanged "placement"
  ├── handleEvent(id, type, payload)
  │     ├── placePoop         — validate + store placement
  │     ├── readyForBattle    — mark side ready, check all-ready
  │     ├── flush             — validate + process shot, timer cancel
  │     └── (internal) turnTimeout — auto-skip on timer expiry
  ├── getState(socketId)      — personalized state, opponent grid censored
  ├── handleDisconnect(id)    — timer still runs; turn skips on expiry
  ├── handlePlayerRemoval(id) — remove from rotation, skip turn if active
  └── end()                   — clear all timers

BattleShitsGame (React, GameUIProps)
  ├── PlacementPhase          — interactive 10×10 grid, piece tray, orientation toggle
  ├── BattlePhase             — dual-grid view, Turn Timer countdown, flush action
  └── GameOverScreen          — winner announcement, poop summary
```

---

## Data Models

### Server-Side Types (`server/src/games/battle-shits/types.ts`)

```typescript
export type Column = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
export type Row = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Cell {
  col: Column;
  row: Row;
}

export type PoopType = "tiny" | "regular" | "big" | "mega";

export const POOP_SIZES: Record<PoopType, number> = {
  tiny: 2,
  regular: 3,
  big: 4,
  mega: 5,
};

/** All four piece types that must be placed per side */
export const ALL_POOP_TYPES: PoopType[] = ["tiny", "regular", "big", "mega"];

export type Orientation = "horizontal" | "vertical";

export interface PlacedPoop {
  type: PoopType;
  cells: Cell[];           // ordered list of occupied cells
  orientation: Orientation;
  hitCells: Set<string>;   // cell keys already hit (e.g. "A1")
  sunk: boolean;
}

export type FlushMarker = "hit" | "miss";

export interface SideGrid {
  sideId: string;                               // playerId (1v1) or teamId (2v2)
  playerIds: string[];                          // players who share this grid
  poops: Map<PoopType, PlacedPoop>;             // placed poops
  flushMarkers: Map<string, FlushMarker>;       // cellKey → marker (for shots RECEIVED)
  outgoingMarkers: Map<string, FlushMarker>;    // cellKey → marker (shots THIS side FIRED)
  ready: boolean;
}

export type GamePhase = "placement" | "battle" | "gameOver";

export interface BattleShitsState {
  phase: GamePhase;
  mode: "1v1" | "2v2";
  sides: SideGrid[];
  activeSideIndex: number;   // index into sides[] for whose turn it is
  activeShooter: string;     // playerId of the specific person taking the shot
  turnTimeRemaining: number; // seconds
  winner: string | null;     // sideId of the winning side
  winnerPlayerIds: string[];
}

// Personalized view emitted to each client via getState
export interface BattleShitsClientState {
  phase: GamePhase;
  mode: "1v1" | "2v2";
  mySideId: string;
  myPoops: Array<{
    type: PoopType;
    cells: Cell[];
    orientation: Orientation;
    sunk: boolean;
  }>;
  myFlushMarkers: Record<string, FlushMarker>;   // cells hit on my grid
  opponentFlushMarkers: Record<string, FlushMarker>; // cells I have flushed
  remainingPoopTypes: PoopType[];                // pieces not yet placed (placement phase)
  activeShooter: string;
  turnTimeRemaining: number;
  teamMates: string[];       // other playerIds on my side (2v2 only)
  winner: string | null;
  winnerPlayerIds: string[];
}
```

---

## Component Design

### BattleShitsModule

#### Initialization (`start`)

1. Retrieve connected players from `context.getPlayers()`.
2. Determine mode:
   - 2 players → 1v1: create two `SideGrid`s, one per player.
   - 3–4 players → 2v2: shuffle player list, assign first half to Side 0, remainder to Side 1.
3. Emit `bsPhaseChanged` to room: `{ phase: "placement", teams, mode }`.

#### Placement Validation (`placePoop`)

Payload: `{ type: PoopType, startCell: Cell, orientation: Orientation }`

Validation steps (in order, fail-fast):
1. Player's side exists and phase is `"placement"`.
2. Poop type not already placed for this side.
3. Compute occupied cells from `startCell`, `orientation`, and `POOP_SIZES[type]`.
4. All cells within A–J × 1–10 bounds.
5. No overlap with already-placed Poops (occupied cell sets are disjoint).
6. No adjacency (including diagonal) with any already-placed Poop.

If any check fails → `emitToPlayer(socketId, "error", { message })`.
If valid → add `PlacedPoop` to `SideGrid.poops`, emit `poopPlaced` back to that player.

#### Adjacency check

Two cells are adjacent if `|col1 - col2| <= 1 AND |row1 - row2| <= 1` (covers orthogonal and diagonal). A placed poop may not have any cell adjacent to any cell of another already-placed poop.

#### Battle Phase Processing (`flush`)

Payload: `{ cell: Cell }`

Validation:
1. Phase must be `"battle"`.
2. `socketId` must equal `activeShooter`.
3. Cell must not already appear in `outgoingMarkers` for the attacking side.

Processing:
1. Cancel Turn Timer.
2. Check if `cell` is in any `PlacedPoop.cells` on the defender's `SideGrid`.
3. Record `"hit"` or `"miss"` in both `outgoingMarkers` (attacker) and `flushMarkers` (defender).
4. If hit: add cell key to `PlacedPoop.hitCells`; if `hitCells.size === cells.length`, mark poop `sunk = true`.
5. Emit `flushResult` to room: `{ cell, result, sunk: PoopType | null }`.
6. If sunk: emit `poopSunk` to room: `{ poopType, sideId: defenderSideId }`.
7. Check win condition: if all 4 defender poops are sunk → `endGame()`.
8. Otherwise advance turn: `advanceTurn()`.

#### Turn Management

```typescript
advanceTurn():
  activeSideIndex = (activeSideIndex + 1) % 2
  // Advance shooter within the newly active side
  side = sides[activeSideIndex]
  currentShooterIndex = side.shooterIndex
  side.shooterIndex = (currentShooterIndex + 1) % side.playerIds.length
  activeShooter = side.playerIds[side.shooterIndex]
  startTurnTimer()
  emitToRoom("bsTurnStarted", { activeShooter, timeRemaining: 30 })
```

#### Turn Timer

- `setTimeout` of 30 000 ms + `setInterval` decrementing `turnTimeRemaining` each second emitting `bsTurnTimerUpdate`.
- On expiry: `emitToRoom("turnSkipped", { playerId: activeShooter, reason: "timeout" })`, then `advanceTurn()`.
- Cancelled on any valid `flush` event.

#### State Censorship (`getState`)

```typescript
getState(socketId):
  side = findSideForPlayer(socketId)
  opponentSide = the other side

  return BattleShitsClientState {
    myPoops: side.poops (full data including positions)
    myFlushMarkers: side.flushMarkers (hits received on my grid)
    opponentFlushMarkers: side.outgoingMarkers (shots I have fired)
    // NEVER include opponentSide.poops positions that are not yet sunk
  }
```

Un-sunk opponent poop cell positions are **never** returned. Only `outgoingMarkers` (which the player fired themselves) are returned for the opponent grid.

---

## Socket Events

### Server → Client (room-wide unless noted)

| Event | Payload | When |
|---|---|---|
| `bsPhaseChanged` | `{ phase, teams?, mode?, activeShooter?, winner?, winnerPlayerIds? }` | Phase transitions |
| `bsTurnStarted` | `{ activeShooter, timeRemaining: 30 }` | Start of each turn |
| `bsTurnTimerUpdate` | `{ timeRemaining }` | Each second during a turn |
| `turnSkipped` | `{ playerId, reason }` | Timer expiry |
| `flushResult` | `{ cell, result, sunk }` | After each flush |
| `poopSunk` | `{ poopType, sideId }` | When a poop is fully sunk |
| `poopPlaced` | `{ type, cells }` | Server-side only → emitToPlayer after valid placement |
| `bsReadyStatus` | `{ sides: [{ sideId, ready }] }` | When any side marks ready |
| `error` | `{ message }` | Invalid actions (emitToPlayer) |

### Client → Server (via `gameEvent`)

| Event type | Payload | Phase |
|---|---|---|
| `placePoop` | `{ type: PoopType, startCell: Cell, orientation: Orientation }` | Placement |
| `readyForBattle` | `{}` | Placement |
| `flush` | `{ cell: Cell }` | Battle |

---

## Client UI Design

### PlacementPhase Component

```
┌─────────────────────────────────────────────┐
│  Place Your Poops 💩                         │
│                                             │
│  Piece Tray:                                │
│  [Tiny 💩×2] [Regular 💩×3] [Big 💩×4] [Mega 💩×5] │
│                                             │
│  Orientation: [Horizontal ↔] [Vertical ↕]  │
│                                             │
│     A  B  C  D  E  F  G  H  I  J           │
│  1  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·           │
│  2  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·           │
│  ...                                        │
│  10 ·  ·  ·  ·  ·  ·  ·  ·  ·  ·           │
│                                             │
│  [Ready for Battle! 🚽]  (disabled until    │
│   all 4 poops placed)                       │
│                                             │
│  Waiting: Team A ✓  Team B ...             │
└─────────────────────────────────────────────┘
```

Hover preview: when a piece is selected and the cursor is over a valid cell, the occupied cells are highlighted green. Invalid placements are highlighted red.

### BattlePhase Component

```
┌─────────────────────────┬─────────────────────────┐
│  YOUR GRID              │  OPPONENT GRID           │
│  (own poops + incoming  │  (only flush markers     │
│   flush markers)        │   visible)               │
│                         │                          │
│     A B C D E F G H I J │     A B C D E F G H I J │
│  1  💩·  · · · · · · · ·│  1  ·  · · · · · · · ·  │
│  2  💩·  · · · · · · · ·│  2  ·  🌊· · · · · · ·  │
│  3  💩·  · 🌊· · · · · ·│  3  ·  · 💥· · · · · ·  │
│  ...                    │  ...                     │
│                         │                          │
│  YOUR TURN ⏱ 28s        │  [tap to flush 🚽]       │
└─────────────────────────┴─────────────────────────┘
```

- Turn timer displayed prominently with color shift to red at ≤10s.
- Hit cells show 💥, miss cells show 🌊, sunk poops show 💨 overlay.
- When not the active shooter: opponent grid is disabled, shows "Waiting for {name}..."

---

## Error Handling

| Scenario | Server response | Client behavior |
|---|---|---|
| placePoop out of bounds | `error` to player | Toast error message |
| placePoop overlap | `error` to player | Flash invalid cells red |
| placePoop adjacency violation | `error` to player | Flash invalid cells red |
| flush on already-flushed cell | `error` to player | Cell shows existing marker |
| flush when not active shooter | `error` to player | Button remains disabled |
| Player disconnects as Active Shooter | Timer continues; auto-skip on expiry | "Waiting..." shown |
| handlePlayerRemoval on Active Shooter | Immediate turn skip | Next turn starts |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid Poop Placements Are Accepted; Invalid Are Rejected with Grid Unchanged

For any board state with zero or more already-placed Poops, and for any `placePoop` attempt: if the placement is valid (within bounds, no overlap, no adjacency, correct size, not already placed), it must be accepted and the grid must reflect the new Poop; if the placement is invalid for any reason, an `error` must be emitted and the grid must remain identical to its pre-attempt state.

**Validates: Requirements 3.2, 3.3**

### Property 2: State Concealment — Opponent Un-hit Poop Positions Are Never Revealed

For any game state (placement or battle phase) and any player, calling `getState` for that player must never include the cell coordinates of opponent Poop cells that have not yet been Hit. The opponent grid in the returned state must contain only `flushMarkers` that the requesting player's side has already fired.

**Validates: Requirements 3.6, 8.1, 8.3**

### Property 3: Turn Alternation After Every Shot

For any valid sequence of `flush` events during the Battle Phase, the `activeSideIndex` must alternate between 0 and 1 after each completed shot. No side may take two consecutive shots.

**Validates: Requirements 4.2, 4.4**

### Property 4: 2v2 Active Shooter Rotation Within a Team

For any 2v2 game and any sequence of turns belonging to a given Team, the Active Shooter must cycle through all connected Team members in round-robin order, returning to the first member after the last.

**Validates: Requirements 4.3**

### Property 5: Flush Result Correctness — Hit, Miss, and Sunk Are Accurately Reported

For any board configuration and any valid `flush` targeting a specific cell: if the cell is occupied by an opponent Poop, the result is `"hit"`; if not occupied, the result is `"miss"`; if the flush causes all cells of a Poop to be hit, the `sunk` field equals that Poop's type and the Poop is marked sunk.

**Validates: Requirements 5.1, 5.4**

### Property 6: Invalid Flush Attempts Are Always Rejected Without Side Effects

For any game state, a `flush` emitted by a player who is not the Active Shooter, or targeting a Cell that has already been flushed, must result in an `error` event to that player, and the game state (active side, turn, board) must remain unchanged.

**Validates: Requirements 5.2, 5.3**

### Property 7: Win Condition — Game Ends Exactly When All Four Opponent Poops Are Sunk

For any sequence of hits, the game must remain active while the opponent has at least one un-sunk Poop; the game must end (phase transitions to `"gameOver"`, `signalGameOver` is called) on the exact flush that causes the fourth opponent Poop to be sunk, never before and never after.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: Own Grid Completeness — getState Always Returns Full Own-Grid Data

For any player and any game phase, calling `getState` must return all placed Poop positions for that player's own side, as well as all flush markers received on that side's grid, with no omissions.

**Validates: Requirements 3.7, 8.2**
