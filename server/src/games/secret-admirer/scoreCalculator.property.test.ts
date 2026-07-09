/**
 * Property-based tests for ScoreCalculator.
 *
 * **Feature: secret-admirer, Property 17: Community vote scoring with ties**
 * **Feature: secret-admirer, Property 20: Correct guess scoring**
 * **Feature: secret-admirer, Property 21: Leaderboard sorting**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculateRoundScores, calculateGuessScores, buildLeaderboard } from "./scoreCalculator.js";

// ─── Arbitraries ────────────────────────────────────────────────────

/** Generates an array of 3–20 unique non-empty player ID strings. */
const arbPlayerIds = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 3,
    maxLength: 20,
  })
  .filter((arr) => arr.length >= 3);

/**
 * Generates a votes map: Map<voterId, authorId>.
 * Voters pick from a set of authors. Each voter votes for exactly one author.
 */
const arbVotes = fc
  .tuple(
    fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
      minLength: 1,
      maxLength: 8,
    })
  )
  .chain(([voters, authors]) => {
    if (authors.length === 0) return fc.constant(new Map<string, string>());
    return fc
      .array(fc.integer({ min: 0, max: authors.length - 1 }), {
        minLength: voters.length,
        maxLength: voters.length,
      })
      .map((indices) => {
        const votes = new Map<string, string>();
        voters.forEach((voterId, i) => {
          votes.set(voterId, authors[indices[i]]);
        });
        return votes;
      });
  });

/** Empty reactions map used for vote-only tests. */
const emptyReactions = new Map<string, Map<string, Set<string>>>();

// ─── Property 17: Community vote scoring with ties ──────────────────

describe("Property 17: Community vote scoring with ties", () => {
  /**
   * **Validates: Requirements 7.4, 7.5, 7.6, 10.4**
   *
   * For any distribution of votes in a round, the author of the message
   * with the most votes SHALL receive 2 points. If two or more messages
   * tie for most votes, all tied authors SHALL each receive 2 points.
   * If no votes are cast, no points SHALL be awarded.
   */

  it("when votes is empty, no community_vote ScoreUpdates are returned", () => {
    fc.assert(
      fc.property(fc.constant(new Map<string, string>()), (votes) => {
        const results = calculateRoundScores(votes, emptyReactions);
        const communityVoteUpdates = results.filter(
          (u) => u.reason === "community_vote"
        );
        expect(communityVoteUpdates).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it("when there's a clear winner, exactly that author gets 2 points with reason community_vote", () => {
    fc.assert(
      fc.property(arbVotes, (votes) => {
        if (votes.size === 0) return; // skip empty case

        const results = calculateRoundScores(votes, emptyReactions);
        const communityVoteUpdates = results.filter(
          (u) => u.reason === "community_vote"
        );

        // Count votes per author
        const voteCounts = new Map<string, number>();
        for (const authorId of votes.values()) {
          voteCounts.set(authorId, (voteCounts.get(authorId) ?? 0) + 1);
        }

        const maxVotes = Math.max(...voteCounts.values());
        const winners = [...voteCounts.entries()]
          .filter(([, count]) => count === maxVotes)
          .map(([authorId]) => authorId);

        if (winners.length === 1) {
          // Clear winner: exactly one author gets 2 pts
          expect(communityVoteUpdates).toHaveLength(1);
          expect(communityVoteUpdates[0].playerId).toBe(winners[0]);
          expect(communityVoteUpdates[0].points).toBe(2);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("when multiple authors tie for the most votes, ALL tied authors get 2 points with reason community_vote", () => {
    fc.assert(
      fc.property(arbVotes, (votes) => {
        if (votes.size === 0) return; // skip empty case

        const results = calculateRoundScores(votes, emptyReactions);
        const communityVoteUpdates = results.filter(
          (u) => u.reason === "community_vote"
        );

        // Count votes per author
        const voteCounts = new Map<string, number>();
        for (const authorId of votes.values()) {
          voteCounts.set(authorId, (voteCounts.get(authorId) ?? 0) + 1);
        }

        const maxVotes = Math.max(...voteCounts.values());
        const winners = [...voteCounts.entries()]
          .filter(([, count]) => count === maxVotes)
          .map(([authorId]) => authorId);

        // All tied winners should receive exactly 2 points
        expect(communityVoteUpdates).toHaveLength(winners.length);

        const awardedPlayerIds = communityVoteUpdates.map((u) => u.playerId);
        for (const winner of winners) {
          expect(awardedPlayerIds).toContain(winner);
        }
        for (const update of communityVoteUpdates) {
          expect(update.points).toBe(2);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("total points awarded for community_vote are always 0 (no votes) or 2*N (N = number of tied winners)", () => {
    fc.assert(
      fc.property(arbVotes, (votes) => {
        const results = calculateRoundScores(votes, emptyReactions);
        const communityVoteUpdates = results.filter(
          (u) => u.reason === "community_vote"
        );

        const totalPoints = communityVoteUpdates.reduce(
          (sum, u) => sum + u.points,
          0
        );

        if (votes.size === 0) {
          expect(totalPoints).toBe(0);
        } else {
          // Total should be 2 * number of winners
          const numWinners = communityVoteUpdates.length;
          expect(totalPoints).toBe(2 * numWinners);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("no author who doesn't have the maximum vote count receives community_vote points", () => {
    fc.assert(
      fc.property(arbVotes, (votes) => {
        if (votes.size === 0) return; // skip empty case

        const results = calculateRoundScores(votes, emptyReactions);
        const communityVoteUpdates = results.filter(
          (u) => u.reason === "community_vote"
        );

        // Count votes per author
        const voteCounts = new Map<string, number>();
        for (const authorId of votes.values()) {
          voteCounts.set(authorId, (voteCounts.get(authorId) ?? 0) + 1);
        }

        const maxVotes = Math.max(...voteCounts.values());

        // Every player who got community_vote points must have the max vote count
        for (const update of communityVoteUpdates) {
          const count = voteCounts.get(update.playerId) ?? 0;
          expect(count).toBe(maxVotes);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 20: Correct guess scoring ─────────────────────────────

/**
 * Generates a valid Hamiltonian cycle from an array of player IDs.
 * Each player maps to the next; last maps to first.
 */
function buildCycleFromPlayers(playerIds: string[]): Map<string, string> {
  const cycle = new Map<string, string>();
  for (let i = 0; i < playerIds.length; i++) {
    const next = (i + 1) % playerIds.length;
    cycle.set(playerIds[i], playerIds[next]);
  }
  return cycle;
}

/**
 * Builds the reverse map: targetId → admirerId.
 */
function buildReverseMap(cycle: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [admirerId, targetId] of cycle) {
    reverse.set(targetId, admirerId);
  }
  return reverse;
}

describe("Property 20: Correct guess scoring", () => {
  /**
   * **Validates: Requirements 10.1**
   *
   * For any player who correctly guesses their admirer during the
   * Guessing_Phase, the system SHALL award exactly 5 points to that player.
   * Players who guess incorrectly or do not guess SHALL receive 0 points
   * for guessing.
   */
  it("awards exactly 5 points for correct guesses, 0 for incorrect or missing guesses", () => {
    fc.assert(
      fc.property(
        arbPlayerIds.chain((playerIds) => {
          return fc.shuffledSubarray(playerIds, { minLength: playerIds.length, maxLength: playerIds.length }).map((shuffled) => {
            const cycle = buildCycleFromPlayers(shuffled);
            return { playerIds, cycle };
          });
        }).chain(({ playerIds, cycle }) => {
          const guessArbs = playerIds.map((playerId) =>
            fc.option(fc.constantFrom(...playerIds), { nil: undefined }).map((guess) => ({
              playerId,
              guess,
            }))
          );
          return fc.tuple(...guessArbs).map((guessEntries) => ({
            playerIds,
            cycle,
            guessEntries,
          }));
        }),
        ({ playerIds, cycle, guessEntries }) => {
          const guesses = new Map<string, string>();
          for (const { playerId, guess } of guessEntries) {
            if (guess !== undefined) {
              guesses.set(playerId, guess);
            }
          }

          const targetToAdmirer = buildReverseMap(cycle);

          const expectedCorrectPlayers = new Set<string>();
          for (const [playerId, guessedAdmirerId] of guesses) {
            const actualAdmirer = targetToAdmirer.get(playerId);
            if (actualAdmirer && guessedAdmirerId === actualAdmirer) {
              expectedCorrectPlayers.add(playerId);
            }
          }

          const updates = calculateGuessScores(guesses, cycle);

          for (const playerId of expectedCorrectPlayers) {
            const match = updates.find((u) => u.playerId === playerId);
            expect(match).toBeDefined();
            expect(match!.points).toBe(5);
            expect(match!.reason).toBe("correct_guess");
          }

          for (const update of updates) {
            expect(expectedCorrectPlayers.has(update.playerId)).toBe(true);
          }

          expect(updates.length).toBe(expectedCorrectPlayers.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Arbitraries for Property 21 ────────────────────────────────────

/**
 * Generates 1-20 unique player entries with IDs, names, and non-negative integer scores.
 */
const arbLeaderboardData = fc
  .uniqueArray(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 12 }),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      score: fc.nat({ max: 1000 }),
    }),
    {
      minLength: 1,
      maxLength: 20,
      selector: (entry) => entry.id,
    }
  )
  .filter((arr) => arr.length >= 1);

// ─── Property 21: Leaderboard sorting ───────────────────────────────

describe("Property 21: Leaderboard sorting", () => {
  /**
   * **Validates: Requirements 10.6**
   *
   * For any set of player scores, the final leaderboard SHALL be sorted
   * in descending order by score, with ties broken alphabetically by
   * player name.
   */
  it("buildLeaderboard produces a correctly sorted and ranked leaderboard", () => {
    fc.assert(
      fc.property(arbLeaderboardData, (players) => {
        const scores = new Map<string, number>();
        const playerNames = new Map<string, string>();

        for (const { id, name, score } of players) {
          scores.set(id, score);
          playerNames.set(id, name);
        }

        const leaderboard = buildLeaderboard(scores, playerNames);

        // 1. The leaderboard has the same number of entries as the scores map
        expect(leaderboard.length).toBe(scores.size);

        // 2. Scores are in descending order (each entry's score >= next entry's score)
        for (let i = 0; i < leaderboard.length - 1; i++) {
          expect(leaderboard[i].score).toBeGreaterThanOrEqual(
            leaderboard[i + 1].score
          );
        }

        // 3. When two adjacent entries have the same score, the first name is alphabetically <= the second
        for (let i = 0; i < leaderboard.length - 1; i++) {
          if (leaderboard[i].score === leaderboard[i + 1].score) {
            expect(
              leaderboard[i].playerName.localeCompare(
                leaderboard[i + 1].playerName
              )
            ).toBeLessThanOrEqual(0);
          }
        }

        // 4. All rank numbers are positive and monotonically non-decreasing
        for (let i = 0; i < leaderboard.length; i++) {
          expect(leaderboard[i].rank).toBeGreaterThan(0);
          if (i > 0) {
            expect(leaderboard[i].rank).toBeGreaterThanOrEqual(
              leaderboard[i - 1].rank
            );
          }
        }

        // 5. Entries with the same score share the same rank
        for (let i = 0; i < leaderboard.length - 1; i++) {
          if (leaderboard[i].score === leaderboard[i + 1].score) {
            expect(leaderboard[i].rank).toBe(leaderboard[i + 1].rank);
          }
        }

        // 6. The first entry has rank 1
        if (leaderboard.length > 0) {
          expect(leaderboard[0].rank).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });
});
