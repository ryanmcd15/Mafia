// --- Spice Levels ---

export type SpiceLevel = "mild" | "medium" | "hot";

// --- Configuration ---

export interface SecretAdmirerConfig {
  rounds: number;
  spiceLevel: SpiceLevel;
  customPrompts: boolean;
  roundTimer: number;
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
  winners: string[];
}

// --- Leaderboard ---

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
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

export const VALID_REACTION_EMOJIS: string[] = ["❤️", "😂", "😍", "🔥", "👀", "💀"];

export const DEFAULT_CONFIG: SecretAdmirerConfig = {
  rounds: 10,
  spiceLevel: "mild",
  customPrompts: false,
  roundTimer: 60,
};

export const MIN_ROUNDS = 5;
export const MAX_ROUNDS = 20;
export const MIN_TIMER = 30;
export const MAX_TIMER = 120;
export const TIMER_STEP = 5;
export const MAX_ANSWER_LENGTH = 500;
export const MAX_CUSTOM_PROMPT_LENGTH = 300;

// --- Event Payload Shapes ---

export interface SaPhaseChangedPayload {
  phase: GamePhase;
  config?: SecretAdmirerConfig;
}

export interface SaAssignmentPayload {
  targetId: string;
  targetName: string;
}

export interface SaRoundStartedPayload {
  roundNumber: number;
  totalRounds: number;
  prompt: string;
  timeRemaining: number;
}

export interface SaAnswerReceivedPayload {
  playerId: string;
  submittedCount: number;
  totalPlayers: number;
}

export interface SaMessageDeliveredPayload {
  message: string;
  roundNumber: number;
}

export interface SaReactionUpdatedPayload {
  messageId: string;
  reactions: Record<string, number>;
}

export interface SaVotingStartedPayload {
  messages: Array<{ id: string; text: string }>;
  timeRemaining: number;
}

export interface SaVoteReceivedPayload {
  votesIn: number;
  totalEligible: number;
}

export interface SaRoundResultsPayload {
  winningMessageId: string | null;
  scores: Record<string, number>;
}

export interface SaGuessingStartedPayload {
  players: Array<{ id: string; name: string }>;
  timeRemaining: number;
}

export type SaRevealDataPayload = RevealData;
