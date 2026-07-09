import type { Award, RoundMessage } from "./types.js";

/**
 * Data needed for awards calculation at end of game.
 */
export interface GameData {
  roundMessages: Map<number, RoundMessage[]>; // round → messages
  guesses: Map<string, string>;               // playerId → guessedAdmirerId
  cycle: Map<string, string>;                 // admirerId → targetId
  playerNames: Map<string, string>;           // playerId → name
}

/**
 * Count total reactions on a single message.
 */
function countMessageReactions(message: RoundMessage): number {
  let total = 0;
  for (const reactors of message.reactions.values()) {
    total += reactors.size;
  }
  return total;
}

/**
 * Biggest Flirt: player who received the highest total number of emoji reactions
 * across all rounds (reactions on messages where they are the target).
 */
function calculateBiggestFlirt(gameData: GameData): Award | null {
  const reactionsByTarget = new Map<string, number>();

  for (const messages of gameData.roundMessages.values()) {
    for (const msg of messages) {
      const current = reactionsByTarget.get(msg.targetId) ?? 0;
      reactionsByTarget.set(msg.targetId, current + countMessageReactions(msg));
    }
  }

  if (reactionsByTarget.size === 0) return null;

  let maxReactions = 0;
  for (const count of reactionsByTarget.values()) {
    if (count > maxReactions) maxReactions = count;
  }

  if (maxReactions === 0) return null;

  const winners: string[] = [];
  for (const [playerId, count] of reactionsByTarget) {
    if (count === maxReactions) winners.push(playerId);
  }

  return {
    name: "Biggest Flirt",
    description: "Received the most emoji reactions across all rounds",
    winners,
  };
}

/**
 * Most Mysterious: admirer(s) whose target did NOT correctly guess them.
 * If ALL admirers were correctly guessed, omit this award entirely.
 */
function calculateMostMysterious(gameData: GameData): Award | null {
  const mysteriousAdmirers: string[] = [];

  // For each admirer → target in the cycle, check if target guessed correctly
  for (const [admirerId, targetId] of gameData.cycle) {
    const targetGuess = gameData.guesses.get(targetId);
    if (targetGuess !== admirerId) {
      mysteriousAdmirers.push(admirerId);
    }
  }

  // If all admirers were correctly guessed, omit the award
  if (mysteriousAdmirers.length === 0) return null;

  // Award to ALL mysterious admirers (those not correctly guessed)
  return {
    name: "Most Mysterious",
    description: "Their target couldn't figure out who they were",
    winners: mysteriousAdmirers,
  };
}

/**
 * Best Compliment: the single message with the highest total emoji reaction count.
 * Ties: all tied message authors win.
 */
function calculateBestCompliment(gameData: GameData): Award | null {
  let maxReactions = 0;
  const messageAuthors: { authorId: string; count: number }[] = [];

  for (const messages of gameData.roundMessages.values()) {
    for (const msg of messages) {
      const count = countMessageReactions(msg);
      messageAuthors.push({ authorId: msg.authorId, count });
      if (count > maxReactions) maxReactions = count;
    }
  }

  if (maxReactions === 0) return null;

  // Collect all authors whose messages tied for the max
  const winnerSet = new Set<string>();
  for (const { authorId, count } of messageAuthors) {
    if (count === maxReactions) winnerSet.add(authorId);
  }

  return {
    name: "Best Compliment",
    description: "Wrote the message that received the most reactions",
    winners: [...winnerSet],
  };
}

/**
 * Calculate standard deviation of an array of numbers.
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Chaos Agent: player whose messages had the highest standard deviation
 * of reaction counts across rounds. Requires at least 2 rounds of submissions.
 */
function calculateChaosAgent(gameData: GameData): Award | null {
  // For each author, collect their per-round total reaction counts
  const authorRoundReactions = new Map<string, number[]>();

  for (const [, messages] of gameData.roundMessages) {
    // Track per-author reaction total for this round
    const roundTotals = new Map<string, number>();
    for (const msg of messages) {
      const count = countMessageReactions(msg);
      const current = roundTotals.get(msg.authorId) ?? 0;
      roundTotals.set(msg.authorId, current + count);
    }

    for (const [authorId, total] of roundTotals) {
      const existing = authorRoundReactions.get(authorId) ?? [];
      existing.push(total);
      authorRoundReactions.set(authorId, existing);
    }
  }

  // Filter to authors with at least 2 rounds of submissions
  let maxStdDev = -1;
  const candidates: { playerId: string; stdDev: number }[] = [];

  for (const [playerId, roundCounts] of authorRoundReactions) {
    if (roundCounts.length < 2) continue;
    const stdDev = standardDeviation(roundCounts);
    candidates.push({ playerId, stdDev });
    if (stdDev > maxStdDev) maxStdDev = stdDev;
  }

  if (candidates.length === 0 || maxStdDev <= 0) return null;

  const winners = candidates
    .filter((c) => c.stdDev === maxStdDev)
    .map((c) => c.playerId);

  return {
    name: "Chaos Agent",
    description: "Had the most unpredictable reaction counts across rounds",
    winners,
  };
}

/**
 * Calculate all end-of-game awards based on game data.
 * Awards are omitted if they cannot be determined (e.g., no reactions, all guesses correct).
 */
export function calculateAwards(gameData: GameData): Award[] {
  const awards: Award[] = [];

  const biggestFlirt = calculateBiggestFlirt(gameData);
  if (biggestFlirt) awards.push(biggestFlirt);

  const mostMysterious = calculateMostMysterious(gameData);
  if (mostMysterious) awards.push(mostMysterious);

  const bestCompliment = calculateBestCompliment(gameData);
  if (bestCompliment) awards.push(bestCompliment);

  const chaosAgent = calculateChaosAgent(gameData);
  if (chaosAgent) awards.push(chaosAgent);

  return awards;
}
