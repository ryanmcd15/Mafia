import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { BattleShitsModule } from "./BattleShitsModule.js";
import { GameModuleContext } from "../../types.js";
import {
  BattleShitsClientState,
  Cell,
  Column,
  Orientation,
  PoopType,
  Row,
} from "./types.js";
import { cellKey } from "./utils.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockContext(
  players: Array<{ id: string; name: string; isConnected: boolean }>
): GameModuleContext {
  return {
    emitToRoom: vi.fn(),
    emitToPlayer: vi.fn(),
    signalGameOver: vi.fn(),
    getPlayers: vi.fn().mockReturnValue(players),
  };
}

function createPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player${i}`,
    isConnected: true,
  }));
}

// ─── Battle Phase Setup Helper ────────────────────────────────────────

/**
 * Transition a fresh module to battle phase.
 * Places all 4 poops for every player using fixed positions, then marks each side ready.
 * Fixed placements (horizontal):
 *   tiny(2)    = A1, B1
 *   regular(3) = A3, B3, C3
 *   big(4)     = A5, B5, C5, D5
 *   mega(5)    = A8, B8, C8, D8, E8
 */
function setupBattlePhase(playerCount = 2) {
  vi.useFakeTimers();
  const players = createPlayers(playerCount);
  const context = createMockContext(players);
  const mod = new BattleShitsModule();
  mod.start(context);

  const fixedPlacements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
    { type: "tiny",    startCell: { col: "A", row: 1 }, orientation: "horizontal" },
    { type: "regular", startCell: { col: "A", row: 3 }, orientation: "horizontal" },
    { type: "big",     startCell: { col: "A", row: 5 }, orientation: "horizontal" },
    { type: "mega",    startCell: { col: "A", row: 8 }, orientation: "horizontal" },
  ];

  for (const player of players) {
    for (const p of fixedPlacements) {
      mod.handleEvent(player.id, "placePoop", p);
    }
    mod.handleEvent(player.id, "readyForBattle", {});
  }

  return { mod, context, players };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getEmitToRoomCalls(context: GameModuleContext, event: string): unknown[] {
  const mock = context.emitToRoom as ReturnType<typeof vi.fn>;
  return mock.mock.calls
    .filter((c) => c[0] === event)
    .map((c) => c[1]);
}

/**
 * Returns the playerId of the current active shooter by inspecting module state.
 */
function getActiveShooter(mod: BattleShitsModule, players: Array<{ id: string }>): string {
  for (const p of players) {
    const state = mod.getState(p.id) as BattleShitsClientState;
    if (state && state.activeShooter === p.id) {
      return p.id;
    }
  }
  // Fall back — get activeShooter field from any player's state
  const state = mod.getState(players[0].id) as BattleShitsClientState;
  return state?.activeShooter ?? "";
}

/**
 * All cells on the 10×10 grid.
 */
function allGridCells(): Cell[] {
  const COLUMNS: Column[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const cells: Cell[] = [];
  for (const col of COLUMNS) {
    for (let row = 1; row <= 10; row++) {
      cells.push({ col, row: row as Row });
    }
  }
  return cells;
}

// ─── All poop cells for the fixed placement layout ────────────────────

/** All 14 cells that need to be hit to sink every poop on one side. */
const ALL_POOP_CELLS: Cell[] = [
  { col: "A", row: 1 }, { col: "B", row: 1 },                                     // tiny  (2)
  { col: "A", row: 3 }, { col: "B", row: 3 }, { col: "C", row: 3 },               // regular (3)
  { col: "A", row: 5 }, { col: "B", row: 5 }, { col: "C", row: 5 }, { col: "D", row: 5 }, // big (4)
  { col: "A", row: 8 }, { col: "B", row: 8 }, { col: "C", row: 8 }, { col: "D", row: 8 }, { col: "E", row: 8 }, // mega (5)
];

/** A cell that is guaranteed to miss (not occupied by any fixed poop). */
const SAFE_MISS_CELL: Cell = { col: "J", row: 10 };

/**
 * Sink exactly `hitCount` of the opponent's poop cells for the initial shooter.
 * Turns alternate, so we interleave hits from one side with misses from the other.
 *
 * The initial shooter fires hits; the other side fires misses on SAFE_MISS_CELL variants
 * (cycling through safe columns to avoid duplicate-cell errors).
 *
 * Returns after `hitCount` successful hits have been registered.
 */
function sinkPoopCells(
  mod: BattleShitsModule,
  context: GameModuleContext,
  players: Array<{ id: string }>,
  hitCount: number
): void {
  // Safe miss cells — enough to cover 14 alternating turns
  const safeMissCells: Cell[] = [
    { col: "F", row: 10 }, { col: "G", row: 10 }, { col: "H", row: 10 },
    { col: "I", row: 10 }, { col: "J", row: 10 }, { col: "F", row: 9 },
    { col: "G", row: 9 },  { col: "H", row: 9 },  { col: "I", row: 9 },
    { col: "J", row: 9 },  { col: "F", row: 8 },  { col: "G", row: 8 },
    { col: "H", row: 8 },  { col: "I", row: 8 },
  ];

  // Determine which player is the initial shooter so we can track "their" side
  const initialShooter = getActiveShooter(mod, players);
  let hitsLanded = 0;
  let missIdx = 0;

  while (hitsLanded < hitCount) {
    const currentShooter = getActiveShooter(mod, players);

    if (currentShooter === initialShooter) {
      // Fire a hit on the next poop cell
      const targetCell = ALL_POOP_CELLS[hitsLanded];
      mod.handleEvent(currentShooter, "flush", { cell: targetCell });
      hitsLanded++;
    } else {
      // Other side fires a miss to give the turn back
      const missCell = safeMissCells[missIdx % safeMissCells.length];
      missIdx++;
      mod.handleEvent(currentShooter, "flush", { cell: missCell });
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("BattleShitsModule Win Condition & State Concealment — Property Tests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Property 7: Win Condition — Game Ends Exactly When All Four Opponent Poops Are Sunk ──

  /**
   * **Validates: Requirements 7.1, 7.2, 7.3**
   *
   * Property 7: After exactly 14 hits (the total cells across all 4 poops),
   * the game must transition to "gameOver" phase.
   *
   * Specifically:
   * - After the 13th hit the game must still be in "battle" phase
   * - The 14th hit must trigger the transition to "gameOver"
   * - `bsPhaseChanged` with `{ phase: "gameOver" }` must be emitted
   * - `signalGameOver` must be called exactly once
   */
  it("Property 7: game ends exactly when all 14 poop cells are sunk (not before)", () => {
    vi.useFakeTimers();
    const { mod, context, players } = setupBattlePhase(2);

    // We drive the game manually in a single pass, checking the phase at each hit.
    // Safe miss cells for the other side (enough for 14 interleaved misses).
    const safeMissCells: Cell[] = [
      { col: "F", row: 10 }, { col: "G", row: 10 }, { col: "H", row: 10 },
      { col: "I", row: 10 }, { col: "J", row: 10 }, { col: "F", row: 9 },
      { col: "G", row: 9 },  { col: "H", row: 9 },  { col: "I", row: 9 },
      { col: "J", row: 9 },  { col: "F", row: 8 },  { col: "G", row: 8 },
      { col: "H", row: 8 },  { col: "I", row: 8 },
    ];

    const initialShooter = getActiveShooter(mod, players);
    let hitsLanded = 0;
    let missIdx = 0;

    // Fire hits 1–13, verifying phase remains "battle" after each
    while (hitsLanded < 13) {
      const currentShooter = getActiveShooter(mod, players);
      if (currentShooter === initialShooter) {
        mod.handleEvent(currentShooter, "flush", { cell: ALL_POOP_CELLS[hitsLanded] });
        hitsLanded++;
        const state = mod.getState(players[0].id) as BattleShitsClientState;
        expect(state.phase).toBe("battle");
      } else {
        mod.handleEvent(currentShooter, "flush", { cell: safeMissCells[missIdx++] });
      }
    }

    // After 13 hits: still in battle, signalGameOver not yet called
    expect((mod.getState(players[0].id) as BattleShitsClientState).phase).toBe("battle");
    expect(context.signalGameOver).not.toHaveBeenCalled();

    // Clear emit tracking before the decisive final hit
    (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

    // Fire the 14th hit — must end the game
    while (hitsLanded < 14) {
      const currentShooter = getActiveShooter(mod, players);
      if (currentShooter === initialShooter) {
        mod.handleEvent(currentShooter, "flush", { cell: ALL_POOP_CELLS[hitsLanded] });
        hitsLanded++;
      } else {
        mod.handleEvent(currentShooter, "flush", { cell: safeMissCells[missIdx++] });
      }
    }

    const stateAfter14 = mod.getState(players[0].id) as BattleShitsClientState;
    expect(stateAfter14.phase).toBe("gameOver");

    // `bsPhaseChanged` with phase "gameOver" must have been emitted
    const phaseChangedCalls = getEmitToRoomCalls(context, "bsPhaseChanged") as Array<{
      phase: string;
      winner?: string;
    }>;
    const gameOverEvent = phaseChangedCalls.find((c) => c.phase === "gameOver");
    expect(gameOverEvent).toBeDefined();
    expect(gameOverEvent?.winner).toBeDefined();

    // `signalGameOver` must have been called exactly once
    expect(context.signalGameOver).toHaveBeenCalledTimes(1);
  });

  /**
   * **Validates: Requirements 7.1, 7.2, 7.3**
   *
   * Property 7b: For any number of hits from 0 to 13, the game must remain in "battle" phase.
   * The game must NOT end prematurely.
   */
  it("Property 7b: game remains in battle phase for any prefix of 0–13 hits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 13 }),
        (hitCount) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          if (hitCount > 0) {
            sinkPoopCells(mod, context, players, hitCount);
          }

          const state = mod.getState(players[0].id) as BattleShitsClientState;
          expect(state.phase).toBe("battle");
          expect(context.signalGameOver).not.toHaveBeenCalled();

          vi.useRealTimers();
        }
      ),
      { numRuns: 14 } // One run per possible hit count 0–13
    );
  });

  // ── Property 2c: Battle-phase state concealment ──────────────────────

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * Property 2c: During battle phase — even after some hits — `getState` must never
   * include un-hit opponent poop cell coordinates.
   *
   * For every player, the state returned by `getState` contains only:
   *   - Their own poops (myPoops) — full cell data is acceptable for own grid
   *   - Their outgoing flush markers (opponentFlushMarkers)
   *
   * The state must NOT expose cells from the opponent's un-hit poop positions
   * in any field other than myPoops.
   *
   * We verify this by checking that none of the opponent's un-hit poop cell keys
   * appear as a "hit" in `opponentFlushMarkers` when we know they haven't been fired.
   * More importantly, we confirm that `getState` carries no extra field with opponent cells.
   */
  it("Property 2c: opponent un-hit poop cells are never present in getState during battle", () => {
    fc.assert(
      fc.property(
        // How many shots to fire before checking concealment (0–10)
        fc.integer({ min: 0, max: 10 }),
        (shotCount) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          // Fire `shotCount` shots using safe miss cells (never hit a poop),
          // alternating turns properly.
          const safeMissCells = allGridCells().filter(
            (c) => !ALL_POOP_CELLS.some((p) => cellKey(p) === cellKey(c))
          );
          let missIdx = 0;
          for (let i = 0; i < shotCount; i++) {
            const shooter = getActiveShooter(mod, players);
            const cell = safeMissCells[missIdx++ % safeMissCells.length];
            mod.handleEvent(shooter, "flush", { cell });
          }

          // Known un-hit poop cell keys on the opponent side (all 14, none have been hit)
          const opponentPoopKeys = new Set(ALL_POOP_CELLS.map(cellKey));

          // For each player, inspect their getState
          for (const player of players) {
            const state = mod.getState(player.id) as BattleShitsClientState;
            expect(state).not.toBeNull();

            // opponentFlushMarkers must only contain cells the player actually fired at.
            // Since we only fired misses at safe cells, none of the poop cell keys
            // should appear in opponentFlushMarkers.
            for (const key of Object.keys(state.opponentFlushMarkers)) {
              expect(opponentPoopKeys.has(key)).toBe(false);
            }

            // The state object must not have any field that exposes raw opponent poop cells.
            // Cast to a plain object and verify no extra "opponentPoops" or similar field leaks.
            const stateAsRecord = state as Record<string, unknown>;

            // These fields must NOT exist on the client state (they would reveal opponent positions)
            expect(stateAsRecord["opponentPoops"]).toBeUndefined();
            expect(stateAsRecord["opponentGrid"]).toBeUndefined();

            // myFlushMarkers are cells hit on THIS player's own grid — verify they don't
            // contain more information than expected (only "hit" or "miss" markers)
            for (const marker of Object.values(state.myFlushMarkers)) {
              expect(["hit", "miss"]).toContain(marker);
            }
          }

          vi.useRealTimers();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * Property 2c (extended): After a mix of hits and misses, getState still does not
   * expose un-hit opponent poop positions. Only the cells that were actually flushed
   * appear in opponentFlushMarkers.
   */
  it("Property 2c (extended): after partial hits, only fired-upon cells appear in opponentFlushMarkers", () => {
    fc.assert(
      fc.property(
        // How many poop cells to hit (1–13 — partial sinking, not game-over)
        fc.integer({ min: 1, max: 13 }),
        (hitCount) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          // Record which side fires the initial hits
          const initialShooter = getActiveShooter(mod, players);
          const hitCellKeys = new Set(
            ALL_POOP_CELLS.slice(0, hitCount).map(cellKey)
          );

          // Sink hitCount cells with alternating turns
          sinkPoopCells(mod, context, players, hitCount);

          // For the initial shooter: opponentFlushMarkers must contain exactly
          // the hit cells (and possibly misses from safe cells fired by the
          // other side also show on the opponent — wait, no: outgoingMarkers
          // are per-side, so the initial shooter's outgoingMarkers = hitCellKeys only).
          const shooterState = mod.getState(initialShooter) as BattleShitsClientState;

          // Every key in opponentFlushMarkers must be one we actually hit
          for (const key of Object.keys(shooterState.opponentFlushMarkers)) {
            expect(hitCellKeys.has(key)).toBe(true);
          }

          // The count must match
          expect(Object.keys(shooterState.opponentFlushMarkers).length).toBe(hitCount);

          // Un-hit poop cells must NOT appear
          const unhitPoopKeys = ALL_POOP_CELLS.slice(hitCount).map(cellKey);
          for (const key of unhitPoopKeys) {
            expect(shooterState.opponentFlushMarkers[key]).toBeUndefined();
          }

          vi.useRealTimers();
        }
      ),
      { numRuns: 30 }
    );
  });
});
