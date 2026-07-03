/**
 * Property tests for Battle Shits grid utilities.
 *
 * **Validates: Requirements 3.2, 3.3**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  cellKey,
  computeOccupiedCells,
  isInBounds,
  hasOverlap,
  hasAdjacency,
} from "./utils.js";
import type { Cell, Column, Orientation, Row } from "./types.js";
import { ALL_POOP_TYPES, POOP_SIZES } from "./types.js";

// ─── Arbitraries ────────────────────────────────────────────────────

const COLUMNS: Column[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const COL_INDEX: Record<Column, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4,
  F: 5, G: 6, H: 7, I: 8, J: 9,
};

const arbColumn = fc.constantFrom<Column>(...COLUMNS);
const arbRow = fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>;
const arbOrientation = fc.constantFrom<Orientation>("horizontal", "vertical");
const arbPoopType = fc.constantFrom(...ALL_POOP_TYPES);

const arbCell: fc.Arbitrary<Cell> = fc.record({
  col: arbColumn,
  row: arbRow,
});

/** Generates a valid start cell such that the poop stays in bounds */
function arbStartCell(orientation: Orientation, size: number): fc.Arbitrary<Cell> {
  if (orientation === "horizontal") {
    return fc.record({
      col: fc.constantFrom(...COLUMNS.slice(0, 11 - size)) as fc.Arbitrary<Column>,
      row: arbRow,
    });
  } else {
    return fc.record({
      col: arbColumn,
      row: fc.integer({ min: 1, max: 11 - size }) as fc.Arbitrary<Row>,
    });
  }
}

// ─── cellKey ────────────────────────────────────────────────────────

describe("cellKey", () => {
  it("produces 'col+row' string for any valid cell", () => {
    fc.assert(
      fc.property(arbCell, (cell) => {
        const key = cellKey(cell);
        expect(key).toBe(`${cell.col}${cell.row}`);
        expect(key.startsWith(cell.col)).toBe(true);
        expect(key.endsWith(String(cell.row))).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it("produces unique keys for distinct cells", () => {
    fc.assert(
      fc.property(arbCell, arbCell, (a, b) => {
        if (a.col !== b.col || a.row !== b.row) {
          expect(cellKey(a)).not.toBe(cellKey(b));
        } else {
          expect(cellKey(a)).toBe(cellKey(b));
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ─── computeOccupiedCells ────────────────────────────────────────────

describe("computeOccupiedCells — Property 1 (cell count)", () => {
  it("returns exactly `size` cells for every poop type and orientation", () => {
    fc.assert(
      fc.property(
        arbPoopType,
        arbOrientation,
        (poopType, orientation) => {
          const size = POOP_SIZES[poopType];
          const startCell = arbStartCell(orientation, size);
          return fc.assert(
            fc.property(startCell, (start) => {
              const cells = computeOccupiedCells(start, orientation, size);
              expect(cells).toHaveLength(size);
            }),
            { numRuns: 50 }
          );
        }
      ),
      { numRuns: 20 }
    );
  });

  it("horizontal: cells share the same row and columns are consecutive", () => {
    fc.assert(
      fc.property(
        arbPoopType,
        fc.record({
          col: fc.constantFrom(...COLUMNS) as fc.Arbitrary<Column>,
          row: arbRow,
        }),
        (poopType, start) => {
          const size = POOP_SIZES[poopType];
          const cells = computeOccupiedCells(start, "horizontal", size);

          // All cells are in bounds check (if start col would overflow, some cells won't be in bounds)
          const allInBounds = cells.every(isInBounds);
          const startColIdx = COL_INDEX[start.col];
          const wouldOverflow = startColIdx + size > 10;

          if (!wouldOverflow) {
            expect(allInBounds).toBe(true);
            // All cells share the same row
            for (const cell of cells) {
              expect(cell.row).toBe(start.row);
            }
            // Columns are sequential
            for (let i = 0; i < cells.length; i++) {
              expect(COLUMNS[COL_INDEX[start.col] + i]).toBe(cells[i].col);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("vertical: cells share the same column and rows are consecutive", () => {
    fc.assert(
      fc.property(
        arbPoopType,
        fc.record({
          col: arbColumn,
          row: fc.integer({ min: 1, max: 10 }) as fc.Arbitrary<Row>,
        }),
        (poopType, start) => {
          const size = POOP_SIZES[poopType];
          const cells = computeOccupiedCells(start, "vertical", size);

          const wouldOverflow = start.row + size - 1 > 10;

          if (!wouldOverflow) {
            expect(cells.every(isInBounds)).toBe(true);
            // All cells share the same column
            for (const cell of cells) {
              expect(cell.col).toBe(start.col);
            }
            // Rows are sequential
            for (let i = 0; i < cells.length; i++) {
              expect(cells[i].row).toBe(start.row + i);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("first cell always equals startCell", () => {
    fc.assert(
      fc.property(arbPoopType, arbOrientation, arbCell, (poopType, orientation, start) => {
        const size = POOP_SIZES[poopType];
        const cells = computeOccupiedCells(start, orientation, size);
        expect(cells[0]).toEqual(start);
      }),
      { numRuns: 200 }
    );
  });
});

// ─── isInBounds ─────────────────────────────────────────────────────

describe("isInBounds — Property 1 (bounds checking)", () => {
  it("accepts all valid cells (A-J, 1-10)", () => {
    fc.assert(
      fc.property(arbCell, (cell) => {
        expect(isInBounds(cell)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it("rejects cells with out-of-bounds row (< 1 or > 10)", () => {
    const invalidRows = [0, 11, -1, 100, 999];
    for (const row of invalidRows) {
      for (const col of COLUMNS) {
        expect(isInBounds({ col, row: row as Row })).toBe(false);
      }
    }
  });

  it("in-bounds computed cells from valid start positions are all valid", () => {
    fc.assert(
      fc.property(
        arbPoopType,
        arbOrientation,
        (poopType, orientation) => {
          const size = POOP_SIZES[poopType];
          return fc.assert(
            fc.property(arbStartCell(orientation, size), (start) => {
              const cells = computeOccupiedCells(start, orientation, size);
              for (const cell of cells) {
                expect(isInBounds(cell)).toBe(true);
              }
            }),
            { numRuns: 50 }
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  it("out-of-bounds computed cells from edge start positions fail isInBounds", () => {
    // Horizontal: start at column J (index 9), size >= 2 → J+1 is out of bounds
    const cells = computeOccupiedCells({ col: "J", row: 1 }, "horizontal", 2);
    // First cell should be in bounds, second should not
    expect(isInBounds(cells[0])).toBe(true);
    expect(isInBounds(cells[1])).toBe(false);

    // Vertical: start at row 10, size >= 2 → row 11 is out of bounds
    const vcells = computeOccupiedCells({ col: "A", row: 10 }, "vertical", 2);
    expect(isInBounds(vcells[0])).toBe(true);
    expect(isInBounds(vcells[1])).toBe(false);
  });
});

// ─── hasOverlap ─────────────────────────────────────────────────────

describe("hasOverlap", () => {
  it("returns false for disjoint cell sets", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbCell, { minLength: 1, maxLength: 5, comparator: (a, b) => cellKey(a) === cellKey(b) }),
        fc.uniqueArray(arbCell, { minLength: 1, maxLength: 5, comparator: (a, b) => cellKey(a) === cellKey(b) }),
        (setA, setB) => {
          // Remove any overlap from setB
          const keysA = new Set(setA.map(cellKey));
          const pureB = setB.filter((c) => !keysA.has(cellKey(c)));

          if (pureB.length > 0) {
            expect(hasOverlap(setA, pureB)).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns true when sets share at least one cell", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbCell, { minLength: 2, maxLength: 5, comparator: (a, b) => cellKey(a) === cellKey(b) }),
        (cells) => {
          // Make setB share the first cell with setA
          const setA = cells.slice(0, Math.ceil(cells.length / 2));
          const sharedCell = setA[0];
          const setB = [sharedCell, ...cells.slice(Math.ceil(cells.length / 2))];

          expect(hasOverlap(setA, setB)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns false for empty inputs", () => {
    fc.assert(
      fc.property(fc.array(arbCell, { minLength: 0, maxLength: 5 }), (cells) => {
        expect(hasOverlap([], cells)).toBe(false);
        expect(hasOverlap(cells, [])).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── hasAdjacency ────────────────────────────────────────────────────

describe("hasAdjacency — Property 1 (adjacency checking)", () => {
  it("returns true for orthogonally adjacent cells", () => {
    // A1 is adjacent to A2 (same col, row diff 1)
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "A", row: 2 }])).toBe(true);
    // A1 is adjacent to B1 (col diff 1, same row)
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "B", row: 1 }])).toBe(true);
  });

  it("returns true for diagonally adjacent cells", () => {
    // A1 is adjacent to B2 (col diff 1, row diff 1 — diagonal)
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "B", row: 2 }])).toBe(true);
    // B2 is adjacent to A1
    expect(hasAdjacency([{ col: "B", row: 2 }], [{ col: "A", row: 1 }])).toBe(true);
  });

  it("returns false for cells that are 2 or more apart", () => {
    // A1 and A3 — row diff is 2
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "A", row: 3 }])).toBe(false);
    // A1 and C1 — col diff is 2
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "C", row: 1 }])).toBe(false);
    // A1 and C3 — both diffs are 2
    expect(hasAdjacency([{ col: "A", row: 1 }], [{ col: "C", row: 3 }])).toBe(false);
  });

  it("property: cells on a valid poop are never adjacent to themselves via a gap", () => {
    // Consecutive cells of a poop (same row/col) should be adjacent to each other
    fc.assert(
      fc.property(
        arbPoopType,
        arbOrientation,
        (poopType, orientation) => {
          const size = POOP_SIZES[poopType];
          return fc.assert(
            fc.property(arbStartCell(orientation, size), (start) => {
              const cells = computeOccupiedCells(start, orientation, size);
              // Every consecutive pair of cells should be adjacent
              for (let i = 0; i < cells.length - 1; i++) {
                expect(hasAdjacency([cells[i]], [cells[i + 1]])).toBe(true);
              }
            }),
            { numRuns: 50 }
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  it("property: two cells with max Chebyshev distance > 1 are never adjacent", () => {
    fc.assert(
      fc.property(arbCell, arbCell, (a, b) => {
        const colDiff = Math.abs(COL_INDEX[a.col] - COL_INDEX[b.col]);
        const rowDiff = Math.abs(a.row - b.row);
        const chebyshev = Math.max(colDiff, rowDiff);

        const adjacent = hasAdjacency([a], [b]);
        if (chebyshev > 1) {
          expect(adjacent).toBe(false);
        }
        if (chebyshev <= 1) {
          expect(adjacent).toBe(true);
        }
      }),
      { numRuns: 500 }
    );
  });

  it("returns false for empty inputs", () => {
    fc.assert(
      fc.property(fc.array(arbCell, { minLength: 0, maxLength: 5 }), (cells) => {
        expect(hasAdjacency([], cells)).toBe(false);
        expect(hasAdjacency(cells, [])).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});
