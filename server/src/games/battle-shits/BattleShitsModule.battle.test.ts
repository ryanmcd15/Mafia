import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { BattleShitsModule } from "./BattleShitsModule.js";
import { GameModuleContext } from "../../types.js";
import {
  ALL_POOP_TYPES,
  BattleShitsClientState,
  Cell,
  Column,
  FlushMarker,
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
 * Places all 4 poops for every player, then marks each side ready.
 * Uses vi.useFakeTimers() so timer callbacks don't fire unless explicitly advanced.
 */
function setupBattlePhase(playerCount = 2) {
  vi.useFakeTimers();
  const players = createPlayers(playerCount);
  const context = createMockContext(players);
  const mod = new BattleShitsModule();
  mod.start(context);

  const fixedPlacements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
    { type: "tiny",    startCell: { col: "A", row: 1  }, orientation: "horizontal" },
    { type: "regular", startCell: { col: "A", row: 3  }, orientation: "horizontal" },
    { type: "big",     startCell: { col: "A", row: 5  }, orientation: "horizontal" },
    { type: "mega",    startCell: { col: "A", row: 8  }, orientation: "horizontal" },
  ];

  // Each player places all 4 poops
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

function getEmitToPlayerCalls(
  context: GameModuleContext,
  socketId: string,
  event: string
): unknown[] {
  const mock = context.emitToPlayer as ReturnType<typeof vi.fn>;
  return mock.mock.calls
    .filter((c) => c[0] === socketId && c[1] === event)
    .map((c) => c[2]);
}

/**
 * Determine which player is the active shooter from the module state.
 * Returns the playerId of the current active shooter.
 */
function getActiveShooter(mod: BattleShitsModule, players: Array<{ id: string }>): string {
  for (const p of players) {
    const state = mod.getState(p.id) as BattleShitsClientState;
    if (state && state.activeShooter === p.id) {
      return p.id;
    }
  }
  // Fall back — get activeShooter from any player's state
  const state = mod.getState(players[0].id) as BattleShitsClientState;
  return state?.activeShooter ?? "";
}

/**
 * All cells on the 10×10 grid as cell keys ("A1"–"J10").
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

// ─── Property Tests ───────────────────────────────────────────────────

describe("BattleShitsModule Battle Phase — Property Tests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Property 3: Turn Alternation After Every Shot ──

  /**
   * **Validates: Requirements 4.2, 4.4**
   *
   * Property 3: For any valid sequence of flush events during the Battle Phase,
   * activeSideIndex alternates between 0 and 1 after each completed shot.
   * No side may take two consecutive shots.
   *
   * We track which side owns the active shooter before and after each flush.
   * The side must alternate on every valid flush.
   */
  it("Property 3: activeSideIndex alternates between 0 and 1 after each valid flush", () => {
    fc.assert(
      fc.property(
        // Generate a sequence of 2–10 flushes (use distinct cells to avoid repeats)
        fc.integer({ min: 2, max: 10 }),
        (shotCount) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          // All cells on the board; we'll take distinct ones in order
          const allCells = allGridCells();

          // Find which side each player belongs to after start
          const state0 = mod.getState(players[0].id) as BattleShitsClientState;
          const state1 = mod.getState(players[1].id) as BattleShitsClientState;

          // In 1v1: player-0 is side 0, player-1 is side 1
          // We determine side by mySideId
          function getSideOfPlayer(playerId: string): string {
            const s = mod.getState(playerId) as BattleShitsClientState;
            return s.mySideId;
          }

          let cellIdx = 0;
          const activeSideHistory: string[] = [];

          for (let shot = 0; shot < shotCount; shot++) {
            const shooterId = getActiveShooter(mod, players);
            const shooterSide = getSideOfPlayer(shooterId);
            activeSideHistory.push(shooterSide);

            // Pick the next unused cell
            const cell = allCells[cellIdx++];

            // Fire the flush
            mod.handleEvent(shooterId, "flush", { cell });

            // Check that the state is still "battle" (game might end if all poops sunk,
            // but our fixed placements require 14 hits total, so 10 shots won't end it)
            const stateAfter = mod.getState(players[0].id) as BattleShitsClientState;
            if (stateAfter.phase !== "battle") break;
          }

          // Verify alternation: consecutive active sides must differ
          for (let i = 1; i < activeSideHistory.length; i++) {
            expect(activeSideHistory[i]).not.toBe(activeSideHistory[i - 1]);
          }

          vi.useRealTimers();
        }
      ),
      { numRuns: 50 }
    );
  });

  // ── Property 4: 2v2 Active Shooter Rotation Within a Team ──

  /**
   * **Validates: Requirements 4.3**
   *
   * Property 4: In 2v2 mode (4 players), after each turn for a given team,
   * the active shooter cycles through team members in round-robin order.
   *
   * We fire enough shots to observe each side shoot multiple times and
   * verify the shooter rotates through all team members.
   */
  it("Property 4: in 2v2, active shooter rotates through team members in round-robin", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 8 }),  // how many total shots to fire
        (totalShots) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(4);

          const allCells = allGridCells();
          let cellIdx = 0;

          // Record which player shot for each side's turns
          const side0Shooters: string[] = [];
          const side1Shooters: string[] = [];

          for (let shot = 0; shot < totalShots; shot++) {
            const shooterId = getActiveShooter(mod, players);
            const shooterState = mod.getState(shooterId) as BattleShitsClientState;
            const shooterSide = shooterState.mySideId;

            if (shooterSide === (mod.getState(players[0].id) as BattleShitsClientState).mySideId) {
              side0Shooters.push(shooterId);
            } else {
              side1Shooters.push(shooterId);
            }

            const cell = allCells[cellIdx++];
            mod.handleEvent(shooterId, "flush", { cell });

            const stateAfter = mod.getState(players[0].id) as BattleShitsClientState;
            if (stateAfter.phase !== "battle") break;
          }

          // For each side that shot more than once, verify no two consecutive turns
          // have the same shooter (round-robin means the shooter must advance).
          // In 2v2, each side has 2 players — so shooter must alternate each time that side shoots.
          for (const shooterHistory of [side0Shooters, side1Shooters]) {
            if (shooterHistory.length >= 2) {
              // Verify that consecutive entries in the same-side history differ
              // (round-robin: A, B, A, B, ...)
              for (let i = 1; i < shooterHistory.length; i++) {
                expect(shooterHistory[i]).not.toBe(shooterHistory[i - 1]);
              }
            }
          }

          vi.useRealTimers();
        }
      ),
      { numRuns: 30 }
    );
  });

  // ── Property 5: Flush Result Correctness ──

  /**
   * **Validates: Requirements 5.1, 5.4**
   *
   * Property 5: Flushing a cell that contains a poop returns "hit"; an empty cell returns "miss".
   * When all cells of a poop are hit, the flushResult event has sunk = that poop's type.
   *
   * We use the fixed placements to know exactly which cells are occupied.
   * Fixed placements (horizontal, row 1/3/5/8):
   *   tiny(2)    = A1, B1
   *   regular(3) = A3, B3, C3
   *   big(4)     = A5, B5, C5, D5
   *   mega(5)    = A8, B8, C8, D8, E8
   */
  it("Property 5: flush result correctly reports hit/miss and sunk poop type", () => {
    fc.assert(
      fc.property(
        // Pick a cell on the grid (arbitrary col and row)
        fc.constantFrom<Column>("A", "B", "C", "D", "E", "F", "G", "H", "I", "J"),
        fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>,
        (col, row) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          // Known occupied cells for the defender (the non-active shooter's side)
          // We'll flush into the defender's grid.
          const knownOccupied = new Set([
            "A1", "B1",             // tiny
            "A3", "B3", "C3",       // regular
            "A5", "B5", "C5", "D5", // big
            "A8", "B8", "C8", "D8", "E8", // mega
          ]);

          const cell: Cell = { col, row };
          const key = cellKey(cell);
          const expectedHit = knownOccupied.has(key);

          const shooter = getActiveShooter(mod, players);
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          mod.handleEvent(shooter, "flush", { cell });

          const flushResults = getEmitToRoomCalls(context, "flushResult") as Array<{
            cell: Cell;
            result: FlushMarker;
            sunk: PoopType | null;
          }>;

          expect(flushResults).toHaveLength(1);
          const fr = flushResults[0];

          if (expectedHit) {
            expect(fr.result).toBe("hit");
          } else {
            expect(fr.result).toBe("miss");
            expect(fr.sunk).toBeNull();
          }

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 5b: sinking a poop sets sunk field to that poop's type", () => {
    // Test that sinking "tiny" (A1, B1) emits sunk = "tiny"
    vi.useFakeTimers();
    const { mod, context, players } = setupBattlePhase(2);

    const shooter = getActiveShooter(mod, players);

    // Hit all cells of "tiny" poop (A1, B1)
    // First shot
    (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();
    mod.handleEvent(shooter, "flush", { cell: { col: "A", row: 1 } });

    let flushResults = getEmitToRoomCalls(context, "flushResult") as Array<{
      cell: Cell; result: FlushMarker; sunk: PoopType | null;
    }>;
    expect(flushResults[0].result).toBe("hit");
    expect(flushResults[0].sunk).toBeNull(); // not yet sunk after 1 of 2 hits

    // Now it's the other side's turn. Let them shoot a miss, then back to first side.
    const shooter2 = getActiveShooter(mod, players);
    mod.handleEvent(shooter2, "flush", { cell: { col: "J", row: 10 } }); // guaranteed miss

    // Back to original shooter
    const shooterAgain = getActiveShooter(mod, players);
    expect(shooterAgain).toBe(shooter);

    (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();
    mod.handleEvent(shooterAgain, "flush", { cell: { col: "B", row: 1 } }); // second tiny cell

    flushResults = getEmitToRoomCalls(context, "flushResult") as Array<{
      cell: Cell; result: FlushMarker; sunk: PoopType | null;
    }>;
    expect(flushResults[0].result).toBe("hit");
    expect(flushResults[0].sunk).toBe("tiny"); // all cells hit → sunk

    vi.useRealTimers();
  });

  // ── Property 6: Invalid Flush Attempts Are Always Rejected Without Side Effects ──

  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * Property 6a: A flush from a non-active-shooter player returns an error,
   * and the game state (active side, turn, board) remains unchanged.
   */
  it("Property 6a: flush by non-active-shooter is rejected with error; state unchanged", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Column>("A", "B", "C", "D", "E"),
        fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>,
        (col, row) => {
          vi.useFakeTimers();
          const { mod, context, players } = setupBattlePhase(2);

          const shooter = getActiveShooter(mod, players);
          const nonShooter = players.find((p) => p.id !== shooter)!;

          const stateBefore = mod.getState(shooter) as BattleShitsClientState;
          const activeShooterBefore = stateBefore.activeShooter;

          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          mod.handleEvent(nonShooter.id, "flush", { cell: { col, row } });

          // Must emit an error to the non-shooter
          const errors = getEmitToPlayerCalls(context, nonShooter.id, "error");
          expect(errors.length).toBeGreaterThan(0);

          // No flushResult should have been emitted to the room
          const flushResults = getEmitToRoomCalls(context, "flushResult");
          expect(flushResults).toHaveLength(0);

          // Active shooter must remain unchanged
          const stateAfter = mod.getState(shooter) as BattleShitsClientState;
          expect(stateAfter.activeShooter).toBe(activeShooterBefore);

          vi.useRealTimers();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * Property 6b: A flush on an already-flushed cell returns an error, state unchanged.
   */
  it("Property 6b: flushing an already-flushed cell is rejected with error; state unchanged", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Column>("F", "G", "H", "I", "J"),
        fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>,
        (col, row) => {
          vi.useFakeTimers();
          const cell: Cell = { col, row };

          // Setup fresh battle phase
          const { mod, context, players } = setupBattlePhase(2);

          // First flush — always valid (cells F–J rows 1–10 are not occupied by fixed placements)
          const shooter1 = getActiveShooter(mod, players);
          mod.handleEvent(shooter1, "flush", { cell });

          // Let the other side shoot a miss to bring turn back to original side
          const shooter2 = getActiveShooter(mod, players);
          mod.handleEvent(shooter2, "flush", { cell: { col: "J", row: 10 } });

          // Now it should be shooter1's side again — get current shooter
          const currentShooter = getActiveShooter(mod, players);

          const stateBefore = mod.getState(currentShooter) as BattleShitsClientState;
          const activeShooterBefore = stateBefore.activeShooter;

          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          // Try flushing the same cell again
          mod.handleEvent(currentShooter, "flush", { cell });

          // Must emit an error to the shooter
          const errors = getEmitToPlayerCalls(context, currentShooter, "error");
          expect(errors.length).toBeGreaterThan(0);

          // No flushResult should have been emitted
          const flushResults = getEmitToRoomCalls(context, "flushResult");
          expect(flushResults).toHaveLength(0);

          // Active shooter must remain unchanged
          const stateAfter = mod.getState(currentShooter) as BattleShitsClientState;
          expect(stateAfter.activeShooter).toBe(activeShooterBefore);

          vi.useRealTimers();
        }
      ),
      { numRuns: 50 }
    );
  });
});
