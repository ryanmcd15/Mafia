import type { Cell, Column, Orientation, Row } from "./types.js";

const COLUMNS: Column[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const COL_INDEX: Record<Column, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4,
  F: 5, G: 6, H: 7, I: 8, J: 9,
};

/** Returns a string key for a cell, e.g. "A1" or "J10" */
export function cellKey(cell: Cell): string {
  return `${cell.col}${cell.row}`;
}

/**
 * Computes the array of cells occupied by a poop starting at `startCell`,
 * extending right (horizontal) or down (vertical) for `size` cells.
 * Does NOT check bounds — use `isInBounds` separately.
 */
export function computeOccupiedCells(
  startCell: Cell,
  orientation: Orientation,
  size: number
): Cell[] {
  const cells: Cell[] = [];
  const startColIdx = COL_INDEX[startCell.col];
  const startRow = startCell.row;

  for (let i = 0; i < size; i++) {
    if (orientation === "horizontal") {
      const colIdx = startColIdx + i;
      const col = COLUMNS[colIdx];
      if (col !== undefined) {
        cells.push({ col, row: startRow });
      } else {
        // Column is beyond "J" — represent as an out-of-bounds sentinel cell
        // (row 11 is guaranteed out-of-bounds, column stays at start col).
        // isInBounds will return false for row 11.
        cells.push({ col: startCell.col, row: (10 + (colIdx - 9)) as Row });
      }
    } else {
      // vertical — row increases (downward)
      const row = (startRow + i) as Row;
      cells.push({ col: startCell.col, row });
    }
  }

  return cells;
}

/** Returns true if the cell is within the valid grid (columns A–J, rows 1–10) */
export function isInBounds(cell: Cell): boolean {
  return (
    COL_INDEX[cell.col] !== undefined &&
    cell.row >= 1 &&
    cell.row <= 10
  );
}

/**
 * Returns true if any cell in `cells` is the same coordinate as any cell
 * in `existingCells`.
 */
export function hasOverlap(cells: Cell[], existingCells: Cell[]): boolean {
  const existingKeys = new Set(existingCells.map(cellKey));
  return cells.some((c) => existingKeys.has(cellKey(c)));
}

/**
 * Returns true if any cell in `cells` is adjacent (orthogonally or diagonally,
 * i.e. Chebyshev distance == 1) to any cell in `existingCells`.
 * Cells that are in both arrays are counted as overlap, not adjacency —
 * call `hasOverlap` first if you need to distinguish.
 */
export function hasAdjacency(cells: Cell[], existingCells: Cell[]): boolean {
  for (const cell of cells) {
    const colIdx = COL_INDEX[cell.col];
    for (const existing of existingCells) {
      const existingColIdx = COL_INDEX[existing.col];
      const colDiff = Math.abs(colIdx - existingColIdx);
      const rowDiff = Math.abs(cell.row - existing.row);
      if (colDiff <= 1 && rowDiff <= 1) {
        return true;
      }
    }
  }
  return false;
}
