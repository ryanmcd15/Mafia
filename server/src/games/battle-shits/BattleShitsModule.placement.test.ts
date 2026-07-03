import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { BattleShitsModule } from "./BattleShitsModule.js";
import { GameModuleContext } from "../../types.js";
import {
  ALL_POOP_TYPES,
  BattleShitsClientState,
  Cell,
  Column,
  Orientation,
  POOP_SIZES,
  PlacedPoop,
  PoopType,
  Row,
  SideGrid,
} from "./types.js";
import { cellKey, computeOccupiedCells, hasAdjacency, hasOverlap, isInBounds } from "./utils.js";

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

function startedModule(playerCount = 2) {
  const players = createPlayers(playerCount);
  const context = createMockContext(players);
  const mod = new BattleShitsModule();
  mod.start(context);
  return { mod, context, players };
}

// ─── fast-check Arbitraries ───────────────────────────────────────────

const COLUMNS: Column[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const COL_INDEX: Record<Column, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4,
  F: 5, G: 6, H: 7, I: 8, J: 9,
};

const arbColumn = fc.constantFrom<Column>(...COLUMNS);
const arbRow = fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>;
const arbCell: fc.Arbitrary<Cell> = fc.record({ col: arbColumn, row: arbRow });
const arbOrientation: fc.Arbitrary<Orientation> = fc.constantFrom<Orientation>("horizontal", "vertical");
const arbPoopType: fc.Arbitrary<PoopType> = fc.constantFrom<PoopType>(...ALL_POOP_TYPES);

/** Generate a poop type and a start cell guaranteed to be in-bounds for that type */
const arbValidPlacement: fc.Arbitrary<{ type: PoopType; startCell: Cell; orientation: Orientation }> =
  fc.tuple(arbPoopType, arbOrientation).chain(([type, orientation]) => {
    const size = POOP_SIZES[type];
    // For horizontal: startCol index must be <= 9 - (size - 1)
    // For vertical: startRow must be <= 10 - (size - 1)
    if (orientation === "horizontal") {
      const maxColIdx = 10 - size;
      return fc.record({
        type: fc.constant(type),
        orientation: fc.constant(orientation),
        startCell: fc.record({
          col: fc.integer({ min: 0, max: maxColIdx }).map((i) => COLUMNS[i] as Column),
          row: arbRow,
        }),
      });
    } else {
      const maxRow = 10 - size + 1;
      return fc.record({
        type: fc.constant(type),
        orientation: fc.constant(orientation),
        startCell: fc.record({
          col: arbColumn,
          row: fc.integer({ min: 1, max: maxRow }) as fc.Arbitrary<Row>,
        }),
      });
    }
  });

/**
 * Generate a sequence of non-conflicting valid placements for all 4 poop types.
 * Uses a greedy approach: pick valid start cells that don't conflict with prior placements.
 */
const arbFourNonConflictingPlacements: fc.Arbitrary<
  Array<{ type: PoopType; startCell: Cell; orientation: Orientation }>
> = fc.constant(null).map(() => {
  // We'll generate deterministically — this is called inside fc.property so
  // we just need an Arbitrary that produces valid non-conflicting sets.
  // Strategy: place poops in fixed non-overlapping rows for each type.
  const placements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
    { type: "tiny",    startCell: { col: "A", row: 1  }, orientation: "horizontal" },
    { type: "regular", startCell: { col: "A", row: 3  }, orientation: "horizontal" },
    { type: "big",     startCell: { col: "A", row: 5  }, orientation: "horizontal" },
    { type: "mega",    startCell: { col: "A", row: 7  }, orientation: "horizontal" },
  ];
  return placements;
});

/**
 * Generate 4 valid non-conflicting placements using fc.record for randomness.
 * Rows are spread out (row 1, 3, 5, 7) to prevent adjacency — 2 row gaps guarantee no diagonal touch.
 */
const arbFourValidPlacements: fc.Arbitrary<
  Array<{ type: PoopType; startCell: Cell; orientation: Orientation }>
> = fc.tuple(
  fc.integer({ min: 0, max: 5 }),  // startCol for tiny (size 2)
  fc.integer({ min: 0, max: 5 }),  // startCol for regular (size 3)
  fc.integer({ min: 0, max: 4 }),  // startCol for big (size 4)
  fc.integer({ min: 0, max: 3 }),  // startCol for mega (size 5) [0..5 but cap at 5 for safety]
).map(([c0, c1, c2, c3]) => {
  const placements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
    { type: "tiny",    startCell: { col: COLUMNS[c0] as Column, row: 1  }, orientation: "horizontal" },
    { type: "regular", startCell: { col: COLUMNS[c1] as Column, row: 3  }, orientation: "horizontal" },
    { type: "big",     startCell: { col: COLUMNS[c2] as Column, row: 5  }, orientation: "horizontal" },
    { type: "mega",    startCell: { col: COLUMNS[c3] as Column, row: 8  }, orientation: "horizontal" },
  ];
  return placements;
});

// ─── Helpers ─────────────────────────────────────────────────────────

/** Helper to get all emitted events of a given type for a player */
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

function getEmitToRoomCalls(
  context: GameModuleContext,
  event: string
): unknown[] {
  const mock = context.emitToRoom as ReturnType<typeof vi.fn>;
  return mock.mock.calls
    .filter((c) => c[0] === event)
    .map((c) => c[1]);
}

// ─── Property Tests ───────────────────────────────────────────────────

describe("BattleShitsModule Placement — Property Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // ── Property 1: Valid Poop Placements Are Accepted; Invalid Are Rejected with Grid Unchanged ──

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * Property 1a: For any valid placement (in-bounds, no overlap, no adjacency),
   * placePoop succeeds, poopPlaced is emitted to the player, and the poop is stored.
   */
  it("Property 1a: valid placements are accepted and poopPlaced is emitted", () => {
    fc.assert(
      fc.property(arbValidPlacement, ({ type, startCell, orientation }) => {
        const { mod, context, players } = startedModule(2);
        const playerId = players[0].id;

        mod.handleEvent(playerId, "placePoop", { type, startCell, orientation });

        const errors = getEmitToPlayerCalls(context, playerId, "error");
        const placed = getEmitToPlayerCalls(context, playerId, "poopPlaced");

        expect(errors).toHaveLength(0);
        expect(placed).toHaveLength(1);
        expect((placed[0] as { type: PoopType }).type).toBe(type);

        // getState should reflect the placed poop
        const state = mod.getState(playerId) as BattleShitsClientState;
        const placedPoop = state.myPoops.find((p) => p.type === type);
        expect(placedPoop).toBeDefined();
        expect(placedPoop!.cells).toHaveLength(POOP_SIZES[type]);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * Property 1b: Out-of-bounds placements are rejected with error emitted,
   * and the grid remains unchanged.
   */
  it("Property 1b: out-of-bounds placements are rejected with error; grid unchanged", () => {
    fc.assert(
      fc.property(
        arbPoopType,
        fc.constantFrom<Orientation>("horizontal", "vertical"),
        fc.integer({ min: 0, max: 9 }),   // startColIdx
        fc.integer({ min: 1, max: 10 }),  // startRow
        (type, orientation, colIdx, row) => {
          const size = POOP_SIZES[type];

          // Filter: only pick placements that go out of bounds
          const wouldGoOutOfBounds =
            (orientation === "horizontal" && colIdx + size > 10) ||
            (orientation === "vertical" && row + size - 1 > 10);

          if (!wouldGoOutOfBounds) return; // skip valid ones

          const { mod, context, players } = startedModule(2);
          const playerId = players[0].id;

          const startCell: Cell = { col: COLUMNS[colIdx] as Column, row: row as Row };

          mod.handleEvent(playerId, "placePoop", { type, startCell, orientation });

          const errors = getEmitToPlayerCalls(context, playerId, "error");
          const placed = getEmitToPlayerCalls(context, playerId, "poopPlaced");

          expect(errors.length).toBeGreaterThan(0);
          expect(placed).toHaveLength(0);

          // Grid must be unchanged
          const state = mod.getState(playerId) as BattleShitsClientState;
          expect(state.myPoops).toHaveLength(0);
          expect(state.remainingPoopTypes).toContain(type);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * Property 1c: Placing the same poop type twice is rejected on the second attempt.
   */
  it("Property 1c: duplicate poop type placement is rejected; grid has only one copy", () => {
    fc.assert(
      fc.property(
        arbValidPlacement,
        arbValidPlacement,
        (first, second) => {
          // Force second placement to use the same type as first
          const secondSameType = { ...second, type: first.type };

          const { mod, context, players } = startedModule(2);
          const playerId = players[0].id;

          // First placement should succeed
          mod.handleEvent(playerId, "placePoop", first);
          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();

          // Second placement with same type should fail
          mod.handleEvent(playerId, "placePoop", secondSameType);

          const errors = getEmitToPlayerCalls(context, playerId, "error");
          const placed = getEmitToPlayerCalls(context, playerId, "poopPlaced");

          expect(errors.length).toBeGreaterThan(0);
          expect(placed).toHaveLength(0);

          // Grid should still have exactly one poop of that type
          const state = mod.getState(playerId) as BattleShitsClientState;
          const samePoop = state.myPoops.filter((p) => p.type === first.type);
          expect(samePoop).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   *
   * Property 1d: Overlapping placements are rejected; grid stays unchanged.
   * Strategy: place a poop, then try placing another at the exact same startCell.
   */
  it("Property 1d: overlapping placements are rejected; grid unchanged", () => {
    fc.assert(
      fc.property(
        arbValidPlacement,
        (first) => {
          const { mod, context, players } = startedModule(2);
          const playerId = players[0].id;

          // Place first poop
          mod.handleEvent(playerId, "placePoop", first);

          const stateBefore = mod.getState(playerId) as BattleShitsClientState;
          const poopCountBefore = stateBefore.myPoops.length;

          // Pick a different type but at the same cell → guaranteed overlap
          const otherType = ALL_POOP_TYPES.find((t) => t !== first.type);
          if (!otherType) return;

          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();

          // Try placing on the same startCell with same orientation — overlap guaranteed
          mod.handleEvent(playerId, "placePoop", {
            type: otherType,
            startCell: first.startCell,
            orientation: first.orientation,
          });

          const errors = getEmitToPlayerCalls(context, playerId, "error");
          expect(errors.length).toBeGreaterThan(0);

          // Grid should be unchanged (still same count)
          const stateAfter = mod.getState(playerId) as BattleShitsClientState;
          expect(stateAfter.myPoops.length).toBe(poopCountBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ── Property 2: State Concealment — Opponent Un-hit Poop Positions Are Never Revealed ──

  /**
   * **Validates: Requirements 3.6, 8.1, 8.3**
   *
   * Property 2: getState for player A never includes player B's un-hit poop cell positions.
   *
   * The key invariant: the state returned to p0 must not expose p1's poop positions.
   * Specifically:
   * - `myPoops` contains only p0's own poops (placed by p0, not p1).
   * - `opponentFlushMarkers` contains only cells p0 has explicitly flushed.
   * - No extra field (opponentPoops, opponentGrid, etc.) exposes p1's layout.
   *
   * We verify this by using DIFFERENT placements for p0 and p1 (different rows),
   * then confirming that myPoops for p0 only contains p0's placements.
   */
  it("Property 2: getState never reveals opponent un-hit poop positions", () => {
    fc.assert(
      fc.property(
        // Use distinct column offsets so p0 and p1 can share the same row structure
        // but have different startCell columns — making them identifiable.
        fc.integer({ min: 0, max: 3 }),   // colOffset for p0 (0–3)
        fc.integer({ min: 5, max: 8 }),   // colOffset for p1 (5–8, guaranteed different from p0)
        (p0ColOffset, p1ColOffset) => {
          const { mod, context, players } = startedModule(2);
          const [p0, p1] = players;

          // p0 placements: all horizontal, rows 1/3/5/8, starting at p0ColOffset
          const p0Placements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
            { type: "tiny",    startCell: { col: COLUMNS[p0ColOffset] as Column, row: 1 }, orientation: "horizontal" },
            { type: "regular", startCell: { col: COLUMNS[p0ColOffset] as Column, row: 3 }, orientation: "horizontal" },
            { type: "big",     startCell: { col: COLUMNS[p0ColOffset] as Column, row: 5 }, orientation: "horizontal" },
            { type: "mega",    startCell: { col: COLUMNS[p0ColOffset] as Column, row: 8 }, orientation: "horizontal" },
          ];

          // p1 placements: all horizontal, rows 1/3/5/8, starting at p1ColOffset
          // p1ColOffset is 5–8, p0 is 0–3 → they share no columns and thus no cells.
          // But crucially both are VALID placements for the 10-col grid.
          const p1Placements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
            { type: "tiny",    startCell: { col: COLUMNS[p1ColOffset] as Column, row: 1 }, orientation: "horizontal" },
            { type: "regular", startCell: { col: COLUMNS[p1ColOffset] as Column, row: 3 }, orientation: "horizontal" },
            { type: "big",     startCell: { col: COLUMNS[Math.min(p1ColOffset, 5)] as Column, row: 5 }, orientation: "horizontal" }, // size 4, must fit
            { type: "mega",    startCell: { col: COLUMNS[Math.min(p1ColOffset, 4)] as Column, row: 8 }, orientation: "horizontal" }, // size 5, must fit
          ];

          for (const p of p0Placements) {
            mod.handleEvent(p0.id, "placePoop", p);
          }
          for (const p of p1Placements) {
            mod.handleEvent(p1.id, "placePoop", p);
          }

          // Collect cell keys that p0 placed
          const p0CellKeys = new Set(
            p0Placements.flatMap(({ type, startCell, orientation }) =>
              computeOccupiedCells(startCell, orientation, POOP_SIZES[type]).map(cellKey)
            )
          );

          // Collect cell keys that p1 placed
          const p1CellKeys = new Set(
            p1Placements.flatMap(({ type, startCell, orientation }) =>
              computeOccupiedCells(startCell, orientation, POOP_SIZES[type]).map(cellKey)
            )
          );

          // Get state for p0
          const stateForP0 = mod.getState(p0.id) as BattleShitsClientState;

          // myPoops must contain ONLY p0's own poop cells — not p1's cells
          // (unless p0 and p1 happen to share the same cell, which can't happen
          //  because different SideGrids are independent — p0's grid is p0's,
          //  p1's grid is p1's)
          for (const poop of stateForP0.myPoops) {
            const poopCellKeys = poop.cells.map(cellKey);
            // Each of p0's poop cells must be in p0's known placements
            for (const key of poopCellKeys) {
              expect(p0CellKeys.has(key)).toBe(true);
            }
          }

          // opponentFlushMarkers must be empty (no flush has occurred)
          expect(Object.keys(stateForP0.opponentFlushMarkers)).toHaveLength(0);

          // The state object must NOT have any extra field exposing p1's layout
          const stateAsRecord = stateForP0 as Record<string, unknown>;
          expect(stateAsRecord["opponentPoops"]).toBeUndefined();
          expect(stateAsRecord["opponentGrid"]).toBeUndefined();
          expect(stateAsRecord["opponentCells"]).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.6, 8.1, 8.3**
   *
   * Property 2b: In an arbitrary state (varying number of placements for opponent),
   * getState for the requesting player never exposes opponent poop cell keys
   * unless those cells have been explicitly flushed (hit/miss marker present).
   */
  it("Property 2b: opponentFlushMarkers never contains cells player has not flushed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        (p0PlacementCount, p1PlacementCount) => {
          const { mod, context, players } = startedModule(2);
          const [p0, p1] = players;

          // Place some poops for each side (using non-conflicting positions from the
          // fixed set to avoid overlaps)
          const fixedPlacements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
            { type: "tiny",    startCell: { col: "A", row: 1  }, orientation: "horizontal" },
            { type: "regular", startCell: { col: "A", row: 3  }, orientation: "horizontal" },
            { type: "big",     startCell: { col: "A", row: 5  }, orientation: "horizontal" },
            { type: "mega",    startCell: { col: "A", row: 8  }, orientation: "horizontal" },
          ];

          for (let i = 0; i < Math.min(p0PlacementCount, fixedPlacements.length); i++) {
            mod.handleEvent(p0.id, "placePoop", fixedPlacements[i]);
          }
          for (let i = 0; i < Math.min(p1PlacementCount, fixedPlacements.length); i++) {
            mod.handleEvent(p1.id, "placePoop", fixedPlacements[i]);
          }

          // Get state for p0 — since no flush events have happened, opponentFlushMarkers
          // must be empty regardless of what p1 has placed
          const state = mod.getState(p0.id) as BattleShitsClientState;
          expect(Object.keys(state.opponentFlushMarkers)).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ── Property 3: Own Grid Completeness — getState Always Returns Full Own-Grid Data ──

  /**
   * **Validates: Requirements 3.7, 8.2**
   *
   * Property 3: getState always returns all placed poops for the requesting player's side.
   * For any sequence of valid placements (0-4), getState must return exactly that many poops
   * with the correct types and cell counts.
   */
  it("Property 3: getState always returns full own-grid data with correct poop types and sizes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        (placementCount) => {
          const { mod, context, players } = startedModule(2);
          const playerId = players[0].id;

          const fixedPlacements: Array<{ type: PoopType; startCell: Cell; orientation: Orientation }> = [
            { type: "tiny",    startCell: { col: "A", row: 1  }, orientation: "horizontal" },
            { type: "regular", startCell: { col: "A", row: 3  }, orientation: "horizontal" },
            { type: "big",     startCell: { col: "A", row: 5  }, orientation: "horizontal" },
            { type: "mega",    startCell: { col: "A", row: 8  }, orientation: "horizontal" },
          ];

          const placed: PoopType[] = [];
          for (let i = 0; i < placementCount; i++) {
            mod.handleEvent(playerId, "placePoop", fixedPlacements[i]);
            placed.push(fixedPlacements[i].type);
          }

          const state = mod.getState(playerId) as BattleShitsClientState;

          // Must return exactly the placed poops
          expect(state.myPoops).toHaveLength(placementCount);

          for (const poopType of placed) {
            const p = state.myPoops.find((mp) => mp.type === poopType);
            expect(p).toBeDefined();
            // Must have the correct number of cells
            expect(p!.cells).toHaveLength(POOP_SIZES[poopType]);
          }

          // remainingPoopTypes must list the unplaced types
          const remaining = ALL_POOP_TYPES.filter((t) => !placed.includes(t));
          expect(state.remainingPoopTypes.sort()).toEqual(remaining.sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.7, 8.2**
   *
   * Property 3b: getState for a player who hasn't placed anything returns
   * empty myPoops and all 4 remaining poop types.
   */
  it("Property 3b: getState for fresh player returns empty myPoops and all remainingPoopTypes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        (playerCount) => {
          const { mod, context, players } = startedModule(playerCount);
          const playerId = players[0].id;

          const state = mod.getState(playerId) as BattleShitsClientState;

          expect(state.myPoops).toHaveLength(0);
          expect(state.remainingPoopTypes.sort()).toEqual([...ALL_POOP_TYPES].sort());
          expect(state.phase).toBe("placement");
          expect(state.winner).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});
