export interface Prompt {
  id: string;
  text: string; // 1-280 chars
  category: "truth" | "dare";
  submittedBy: string; // player ID
}

export interface TruthOrDareState {
  phase: "submission" | "play";
  promptPool: Prompt[];
  readyPlayers: string[]; // player IDs
  currentSelectedPlayer: string | null;
  currentPrompt: Prompt | null;
  currentCategory: "truth" | "dare" | null;
  hostId: string;
}
