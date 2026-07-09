// --- Spice Levels ---

export type SpiceLevel = "mild" | "medium" | "hot";

// --- Configuration ---

export interface SecretAdmirerConfig {
  rounds: number;           // 5-20, default 10
  spiceLevel: SpiceLevel;   // default "mild"
  customPrompts: boolean;   // default false
  roundTimer: number;       // 30-120 seconds, step 5, default 60
}

// --- Game Phases ---

export type GamePhase =
  | "config"
  | "roundActive"
  | "messageDelivery"
  | "reactions"
  | "voting"
  | "guessing"
  | "reveal";

// --- Round Message ---

export interface RoundMessage {
  id: string;
  authorId: string;
  targetId: string;
  text: string;
  submittedAt: number;  // timestamp (ms from round start)
  reactions: Map<string, Set<string>>; // emoji → set of reactor playerIds
}

// --- Server State ---

export interface SecretAdmirerState {
  phase: GamePhase;
  config: SecretAdmirerConfig;
  cycle: Map<string, string>;          // admirer → target
  currentRound: number;
  totalRounds: number;
  usedPrompts: Set<string>;
  currentPrompt: string | null;
  roundPrompts: Map<number, string>;   // round → prompt used
  customPromptQueue: Map<string, string>; // playerId → prompt text
  roundMessages: Map<number, RoundMessage[]>; // round → messages
  currentRoundAnswers: Map<string, string>;   // playerId → answer text
  votes: Map<number, Map<string, string>>;    // round → (voterId → messageAuthorId)
  guesses: Map<string, string>;               // playerId → guessedAdmirerId
  scores: Map<string, number>;                // playerId → cumulative score
  roundStartTime: number | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  reactionTimer: ReturnType<typeof setTimeout> | null;
  votingTimer: ReturnType<typeof setTimeout> | null;
  guessingTimer: ReturnType<typeof setTimeout> | null;
}

// --- Client State ---

export interface SecretAdmirerClientState {
  phase: GamePhase;
  config: SecretAdmirerConfig;
  myTargetName: string | null;
  currentRound: number;
  totalRounds: number;
  currentPrompt: string | null;
  timeRemaining: number;
  hasSubmittedAnswer: boolean;
  submittedCount: number;
  totalPlayers: number;
  myMessages: Array<{
    id: string;
    roundNumber: number;
    text: string;
    reactions: Record<string, number>;
    myReactions: string[];
  }>;
  votingMessages: Array<{ id: string; text: string }> | null;
  hasVoted: boolean;
  guessOptions: Array<{ id: string; name: string }> | null;
  hasGuessed: boolean;
  scores: Record<string, number>;
  revealData: RevealData | null;
}

// --- Awards ---

export interface Award {
  name: string;
  description: string;
  winners: string[]; // player IDs
}

// --- Leaderboard ---

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
}

// --- Score Update ---

export interface ScoreUpdate {
  playerId: string;
  points: number;
  reason: string;
}

// --- Reveal Data ---

export interface RevealData {
  cycle: Array<{ admirerId: string; admirerName: string; targetId: string; targetName: string }>;
  guesses: Array<{
    playerId: string;
    playerName: string;
    guessedId: string | null;
    guessedName: string | null;
    actualAdmirerId: string;
    actualAdmirerName: string;
    correct: boolean;
  }>;
  messages: Array<{
    roundNumber: number;
    prompt: string | null;
    messages: Array<{
      authorId: string;
      authorName: string;
      targetId: string;
      targetName: string;
      text: string;
    }>;
  }>;
  statistics: {
    mostReactedMessage: { authorName: string; text: string; reactionCount: number } | null;
    longestAnswer: { authorName: string; text: string; length: number } | null;
    shortestAnswer: { authorName: string; text: string; length: number } | null;
    fastestSubmission: { authorName: string; text: string; timeSeconds: number } | null;
  };
  leaderboard: LeaderboardEntry[];
  awards: Award[];
}

// --- Constants ---

/** Predefined reaction emojis available for messages (Req 6.1) */
export const VALID_REACTION_EMOJIS: string[] = ["❤️", "😂", "😍", "🔥", "👀", "💀"];

/** Default game configuration (Req 2.6) */
export const DEFAULT_CONFIG: SecretAdmirerConfig = {
  rounds: 10,
  spiceLevel: "mild",
  customPrompts: false,
  roundTimer: 60,
};

/** Minimum number of rounds allowed (Req 2.2) */
export const MIN_ROUNDS = 5;

/** Maximum number of rounds allowed (Req 2.2) */
export const MAX_ROUNDS = 20;

/** Minimum round timer duration in seconds (Req 2.7) */
export const MIN_TIMER = 30;

/** Maximum round timer duration in seconds (Req 2.7) */
export const MAX_TIMER = 120;

/** Round timer adjustment step in seconds (Req 2.7) */
export const TIMER_STEP = 5;

/** Maximum character length for player answers (Req 5.2) */
export const MAX_ANSWER_LENGTH = 500;

/** Maximum character length for custom prompts */
export const MAX_CUSTOM_PROMPT_LENGTH = 300;
