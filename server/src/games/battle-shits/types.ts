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
  shooterIndex: number;                         // for 2v2 round-robin
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
  myFlushMarkers: Record<string, FlushMarker>;        // cells hit on my grid
  opponentFlushMarkers: Record<string, FlushMarker>;  // cells I have flushed
  remainingPoopTypes: PoopType[];                     // pieces not yet placed (placement phase)
  activeShooter: string;
  turnTimeRemaining: number;
  teamMates: string[];   // other playerIds on my side (2v2 only)
  winner: string | null;
  winnerPlayerIds: string[];
}
