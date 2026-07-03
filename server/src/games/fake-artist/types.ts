/** Phases of the Fake Artist game */
export type FAPhase =
  | "roleAssignment"
  | "drawing1"
  | "drawing2"
  | "voting"
  | "result";

/** A single point on the canvas (normalized 0-1) */
export interface FAPoint {
  x: number;
  y: number;
}

/** A completed stroke */
export interface FAStroke {
  playerId: string;
  color: string;
  points: FAPoint[];
  round: 1 | 2;
}

/** Player color assignments */
export const FA_COLORS: string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** Word list (50+ simple words) */
export const FA_WORDS: string[] = [
  "Sun",
  "House",
  "Cat",
  "Dog",
  "Tree",
  "Car",
  "Pizza",
  "Moon",
  "Fish",
  "Boat",
  "Guitar",
  "Flower",
  "Clock",
  "Umbrella",
  "Hat",
  "Shoe",
  "Bird",
  "Star",
  "Heart",
  "Crown",
  "Rainbow",
  "Mountain",
  "Beach",
  "Castle",
  "Robot",
  "Rocket",
  "Balloon",
  "Cake",
  "Spider",
  "Snake",
  "Elephant",
  "Penguin",
  "Dinosaur",
  "Bicycle",
  "Airplane",
  "Train",
  "Bridge",
  "Lighthouse",
  "Volcano",
  "Waterfall",
  "Butterfly",
  "Octopus",
  "Dragon",
  "Unicorn",
  "Snowman",
  "Pirate",
  "Mermaid",
  "Alien",
  "Ghost",
];

/** Client state returned by getState */
export interface FAClientState {
  phase: FAPhase;
  word: string | null; // null for fake artist ("???")
  isFakeArtist: boolean;
  myColor: string;
  players: Array<{ id: string; name: string; color: string }>;
  turnOrder: string[];
  currentTurnIndex: number;
  currentPlayerId: string;
  isMyTurn: boolean;
  strokes: FAStroke[];
  turnTimeRemaining: number;
  votes: Record<string, string>; // voterId -> accusedId (only after voting done)
  accusedId: string | null;
  fakeArtistId: string | null; // revealed in result phase
  fakeArtistGuess: string | null;
  fakeArtistWon: boolean | null;
  round: 1 | 2;
}
