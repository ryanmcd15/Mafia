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

export type FlushMarker = "hit" | "miss";

export type GamePhase = "placement" | "battle" | "gameOver";

/** Personalized view emitted to each client via getState */
export interface BattleShitsClientState {
  phase: GamePhase;
  mode: "1v1" | "2v2";
  mySideId: string;
  myPoops: Array<{
    type: PoopType;
    cells: Cell[];
    orientation: Orientation;
    sunk: boolean;
    hitCells: string[];
  }>;
  myFlushMarkers: Record<string, FlushMarker>;       // cells hit on my grid
  opponentFlushMarkers: Record<string, FlushMarker>; // cells I have flushed
  remainingPoopTypes: PoopType[];                    // pieces not yet placed (placement phase)
  activeShooter: string;
  turnTimeRemaining: number;
  teamMates: string[];   // other playerIds on my side (2v2 only)
  winner: string | null;
  winnerPlayerIds: string[];
}

/** Derive a unique string key from a cell coordinate */
export function cellKey(cell: Cell): string {
  return `${cell.col}${cell.row}`;
}

export const COLUMNS: Column[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
export const ROWS: Row[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
