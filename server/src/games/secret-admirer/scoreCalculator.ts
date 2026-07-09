import { ScoreUpdate, LeaderboardEntry } from "./types.js";

/**
 * Calculate round scores from community votes and reactions.
 *
 * - Most votes: 2 pts (all tied players get 2 pts if tie)
 * - Most total reactions: 2 pts (all tied players get 2 pts if tie)
 */
export function calculateRoundScores(
  votes: Map<string, string>,
  reactions: Map<string, Map<string, Set<string>>>
): ScoreUpdate[] {
  const updates: ScoreUpdate[] = [];

  // --- Vote scoring ---
  if (votes.size > 0) {
    // Count votes per author
    const voteCounts = new Map<string, number>();
    for (const authorId of votes.values()) {
      voteCounts.set(authorId, (voteCounts.get(authorId) ?? 0) + 1);
    }

    const maxVotes = Math.max(...voteCounts.values());
    if (maxVotes > 0) {
      for (const [authorId, count] of voteCounts) {
        if (count === maxVotes) {
          updates.push({ playerId: authorId, points: 2, reason: "community_vote" });
        }
      }
    }
  }

  // --- Reaction scoring ---
  if (reactions.size > 0) {
    // Sum total reactions per author
    const reactionCounts = new Map<string, number>();
    for (const [authorId, emojiMap] of reactions) {
      let total = 0;
      for (const reactorSet of emojiMap.values()) {
        total += reactorSet.size;
      }
      reactionCounts.set(authorId, total);
    }

    const maxReactions = Math.max(...reactionCounts.values());
    if (maxReactions > 0) {
      for (const [authorId, count] of reactionCounts) {
        if (count === maxReactions) {
          updates.push({ playerId: authorId, points: 2, reason: "most_reactions" });
        }
      }
    }
  }

  return updates;
}

/**
 * Calculate guess scores. Award 5 pts for each player who correctly
 * identified their admirer.
 *
 * The cycle maps admirerId → targetId. A player's admirer is the key
 * in the cycle whose value equals that player's id.
 */
export function calculateGuessScores(
  guesses: Map<string, string>,
  cycle: Map<string, string>
): ScoreUpdate[] {
  const updates: ScoreUpdate[] = [];

  // Build reverse lookup: targetId → admirerId
  const targetToAdmirer = new Map<string, string>();
  for (const [admirerId, targetId] of cycle) {
    targetToAdmirer.set(targetId, admirerId);
  }

  for (const [playerId, guessedAdmirerId] of guesses) {
    const actualAdmirerId = targetToAdmirer.get(playerId);
    if (actualAdmirerId && guessedAdmirerId === actualAdmirerId) {
      updates.push({ playerId, points: 5, reason: "correct_guess" });
    }
  }

  return updates;
}

/**
 * Build a sorted leaderboard from cumulative scores.
 * Sorted descending by score, ties broken alphabetically by player name.
 */
export function buildLeaderboard(
  scores: Map<string, number>,
  playerNames: Map<string, string>
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const [playerId, score] of scores) {
    entries.push({
      playerId,
      playerName: playerNames.get(playerId) ?? playerId,
      score,
      rank: 0,
    });
  }

  // Sort: descending score, then alphabetical name for ties
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.playerName.localeCompare(b.playerName);
  });

  // Assign ranks
  for (let i = 0; i < entries.length; i++) {
    if (i === 0 || entries[i].score !== entries[i - 1].score) {
      entries[i].rank = i + 1;
    } else {
      entries[i].rank = entries[i - 1].rank;
    }
  }

  return entries;
}
