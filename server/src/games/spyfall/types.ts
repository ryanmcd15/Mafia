export interface SpyfallState {
  phase: "question" | "voting";
  isSpy: boolean; // true for the spy's getState()
  location: string | null; // null for spy, actual location for others
  allLocations: string[]; // always shown to all (spy reference)
  currentQuestioner: string;
  currentTarget: string | null;
  timeRemaining: number; // seconds
  turnOrder: string[];
}

export const SPYFALL_LOCATIONS: string[] = [
  "Airport",
  "Bank",
  "Beach",
  "Casino",
  "Cathedral",
  "Circus",
  "Corporate Office",
  "Cruise Ship",
  "Day Spa",
  "Embassy",
  "Hospital",
  "Hotel",
  "Military Base",
  "Movie Studio",
  "Museum",
  "Ocean Liner",
  "Passenger Train",
  "Pirate Ship",
  "Police Station",
  "Restaurant",
  "School",
  "Space Station",
  "Submarine",
  "Supermarket",
  "University",
];
