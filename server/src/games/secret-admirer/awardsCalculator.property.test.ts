/**
 * Property tests for Awards Calculation.
 *
 * **Feature: secret-admirer, Property 22: Awards calculation correctness**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculateAwards, type GameData } from "./awardsCalculator.js";
import type { RoundMessage } from "./types.js";

// ─── Arbitraries ────────────────────────────────────────────────────

/** Generates an array of 3-8 unique non-empty player ID strings. */
const arbPlayerIds = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
    minLength: 3,
    maxLength: 8,
  })
  .filter((arr) => arr.length >= 3);

/** Generate a valid Hamiltonian cycle from player IDs. */
function arbCycle(playerIds: string[]): Map<string, string> {
  const cycle = new Map<string, string>();
  // Cycle: each player admires the next, last admires first
  for (let i = 0; i < playerIds.length; i++) {
    cycle.set(playerIds[i], playerIds[(i + 1) % playerIds.length]);
  }
  return cycle;
}

/** Arbitrary for a reactions map: 0-3 emojis each with 0-3 reactors from the pool. */
function arbReactions(playerPool: string[]): fc.Arbitrary<Map<string, Set<string>>> {
  const emojis = ["❤️", "😂", "😍", "🔥", "👀", "💀"];
  return fc
    .array(
      fc.record({
        emoji: fc.constantFrom(...emojis),
        reactors: fc.subarray(playerPool, { minLength: 0, maxLength: 3 }),
      }),
      { minLength: 0, maxLength: 3 }
    )
    .map((entries) => {
      const reactions = new Map<string, Set<string>>();
      for (const { emoji, reactors } of entries) {
        if (!reactions.has(emoji)) {
          reactions.set(emoji, new Set(reactors));
        }
      }
      return reactions;
    });
}

/** Generate round messages: for each round, one message per player to their target. */
function arbGameData(playerIds: string[]): fc.Arbitrary<GameData> {
  const cycle = arbCycle(playerIds);

  return fc
    .record({
      numRounds: fc.integer({ min: 2, max: 5 }),
      guessCorrectness: fc.array(fc.boolean(), {
        minLength: playerIds.length,
        maxLength: playerIds.length,
      }),
    })
    .chain(({ numRounds, guessCorrectness }) => {
      // Generate round messages
      const roundMessagesArb = fc
        .array(
          fc.tuple(
            ...playerIds.map((playerId) => {
              const targetId = cycle.get(playerId)!;
              return arbReactions(playerIds).map((reactions) => ({
                authorId: playerId,
                targetId,
                text: "test message",
                submittedAt: Date.now(),
                reactions,
              }));
            })
          ),
          { minLength: numRounds, maxLength: numRounds }
        )
        .map((rounds) => {
          const roundMessages = new Map<number, RoundMessage[]>();
          for (let i = 0; i < rounds.length; i++) {
            roundMessages.set(i + 1, rounds[i]);
          }
          return roundMessages;
        });

      return roundMessagesArb.map((roundMessages) => {
        // Build guesses: for each target in the cycle, either guess the correct admirer or a wrong one
        const guesses = new Map<string, string>();
        for (let i = 0; i < playerIds.length; i++) {
          const admirerId = playerIds[i];
          const targetId = cycle.get(admirerId)!;
          if (guessCorrectness[i]) {
            // Target guesses correctly: they guess admirerId
            guesses.set(targetId, admirerId);
          } else {
            // Target guesses incorrectly: pick someone else
            const wrongGuess = playerIds.find(
              (p) => p !== admirerId && p !== targetId
            );
            if (wrongGuess) {
              guesses.set(targetId, wrongGuess);
            }
            // If no wrong guess available (shouldn't happen with 3+ players), skip
          }
        }

        const playerNames = new Map<string, string>();
        for (const id of playerIds) {
          playerNames.set(id, `Player_${id}`);
        }

        return {
          roundMessages,
          guesses,
          cycle,
          playerNames,
        } satisfies GameData;
      });
    });
}

// ─── Helper functions ───────────────────────────────────────────────

function countMessageReactions(msg: RoundMessage): number {
  let total = 0;
  for (const reactors of msg.reactions.values()) {
    total += reactors.size;
  }
  return total;
}

function getTotalReactionsByTarget(
  roundMessages: Map<number, RoundMessage[]>
): Map<string, number> {
  const reactionsByTarget = new Map<string, number>();
  for (const messages of roundMessages.values()) {
    for (const msg of messages) {
      const current = reactionsByTarget.get(msg.targetId) ?? 0;
      reactionsByTarget.set(msg.targetId, current + countMessageReactions(msg));
    }
  }
  return reactionsByTarget;
}

function getMaxSingleMessageReaction(
  roundMessages: Map<number, RoundMessage[]>
): { maxCount: number; authorIds: Set<string> } {
  let maxCount = 0;
  const authorIds = new Set<string>();
  const messageAuthors: { authorId: string; count: number }[] = [];

  for (const messages of roundMessages.values()) {
    for (const msg of messages) {
      const count = countMessageReactions(msg);
      messageAuthors.push({ authorId: msg.authorId, count });
      if (count > maxCount) maxCount = count;
    }
  }

  for (const { authorId, count } of messageAuthors) {
    if (count === maxCount) authorIds.add(authorId);
  }

  return { maxCount, authorIds };
}

function getAuthorRoundCounts(
  roundMessages: Map<number, RoundMessage[]>
): Map<string, number[]> {
  const authorRoundReactions = new Map<string, number[]>();

  for (const messages of roundMessages.values()) {
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

  return authorRoundReactions;
}

// ─── Property 22: Awards calculation correctness ────────────────────

describe("Property 22: Awards calculation correctness", () => {
  /**
   * **Validates: Requirements 11.1, 11.2, 11.3**
   */
  it("Most Mysterious is omitted when ALL players' admirers were correctly guessed", () => {
    fc.assert(
      fc.property(arbPlayerIds, (playerIds) => {
        const cycle = arbCycle(playerIds);

        // All guesses are correct: every target guesses their actual admirer
        const guesses = new Map<string, string>();
        for (const [admirerId, targetId] of cycle) {
          guesses.set(targetId, admirerId);
        }

        const roundMessages = new Map<number, RoundMessage[]>();
        roundMessages.set(1, playerIds.map((id) => ({
          authorId: id,
          targetId: cycle.get(id)!,
          text: "test",
          submittedAt: 1000,
          reactions: new Map(),
        })));

        const playerNames = new Map<string, string>();
        for (const id of playerIds) playerNames.set(id, `Player_${id}`);

        const gameData: GameData = { roundMessages, guesses, cycle, playerNames };
        const awards = calculateAwards(gameData);

        const mostMysterious = awards.find((a) => a.name === "Most Mysterious");
        expect(mostMysterious).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("Most Mysterious is present when at least one target guessed incorrectly, and winners are correct", () => {
    fc.assert(
      fc.property(
        arbPlayerIds.chain((playerIds) => {
          const cycle = arbCycle(playerIds);
          // Generate guesses where at least one is wrong
          return fc
            .array(fc.boolean(), {
              minLength: playerIds.length,
              maxLength: playerIds.length,
            })
            .filter((correctness) => correctness.includes(false))
            .map((correctness) => ({ playerIds, cycle, correctness }));
        }),
        ({ playerIds, cycle, correctness }) => {
          const guesses = new Map<string, string>();
          const entries = [...cycle.entries()];

          for (let i = 0; i < entries.length; i++) {
            const [admirerId, targetId] = entries[i];
            if (correctness[i]) {
              guesses.set(targetId, admirerId);
            } else {
              const wrongGuess = playerIds.find(
                (p) => p !== admirerId && p !== targetId
              );
              if (wrongGuess) guesses.set(targetId, wrongGuess);
            }
          }

          const roundMessages = new Map<number, RoundMessage[]>();
          roundMessages.set(1, playerIds.map((id) => ({
            authorId: id,
            targetId: cycle.get(id)!,
            text: "test",
            submittedAt: 1000,
            reactions: new Map(),
          })));

          const playerNames = new Map<string, string>();
          for (const id of playerIds) playerNames.set(id, `Player_${id}`);

          const gameData: GameData = { roundMessages, guesses, cycle, playerNames };
          const awards = calculateAwards(gameData);

          const mostMysterious = awards.find((a) => a.name === "Most Mysterious");
          expect(mostMysterious).toBeDefined();

          // Winners should be exactly those admirers whose targets guessed incorrectly
          const expectedWinners = new Set<string>();
          for (let i = 0; i < entries.length; i++) {
            const [admirerId, targetId] = entries[i];
            const targetGuess = guesses.get(targetId);
            if (targetGuess !== admirerId) {
              expectedWinners.add(admirerId);
            }
          }

          expect(new Set(mostMysterious!.winners)).toEqual(expectedWinners);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Biggest Flirt winners have the highest total reactions received; absent when no reactions", () => {
    fc.assert(
      fc.property(
        arbPlayerIds.chain((playerIds) => arbGameData(playerIds).map((gd) => ({ playerIds, gd }))),
        ({ playerIds, gd }) => {
          const awards = calculateAwards(gd);
          const biggestFlirt = awards.find((a) => a.name === "Biggest Flirt");

          const reactionsByTarget = getTotalReactionsByTarget(gd.roundMessages);
          let maxReactions = 0;
          for (const count of reactionsByTarget.values()) {
            if (count > maxReactions) maxReactions = count;
          }

          if (maxReactions === 0) {
            // No reactions means no Biggest Flirt award
            expect(biggestFlirt).toBeUndefined();
          } else {
            expect(biggestFlirt).toBeDefined();
            // All winners should have the max reactions
            const expectedWinners = new Set<string>();
            for (const [playerId, count] of reactionsByTarget) {
              if (count === maxReactions) expectedWinners.add(playerId);
            }
            expect(new Set(biggestFlirt!.winners)).toEqual(expectedWinners);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Best Compliment winners are authors of the highest single-message reaction count; absent when no reactions", () => {
    fc.assert(
      fc.property(
        arbPlayerIds.chain((playerIds) => arbGameData(playerIds).map((gd) => ({ playerIds, gd }))),
        ({ playerIds, gd }) => {
          const awards = calculateAwards(gd);
          const bestCompliment = awards.find((a) => a.name === "Best Compliment");

          const { maxCount, authorIds } = getMaxSingleMessageReaction(gd.roundMessages);

          if (maxCount === 0) {
            expect(bestCompliment).toBeUndefined();
          } else {
            expect(bestCompliment).toBeDefined();
            expect(new Set(bestCompliment!.winners)).toEqual(authorIds);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Chaos Agent winners all have at least 2 rounds of submissions; absent if no player has 2+ rounds", () => {
    fc.assert(
      fc.property(
        arbPlayerIds.chain((playerIds) => arbGameData(playerIds).map((gd) => ({ playerIds, gd }))),
        ({ playerIds, gd }) => {
          const awards = calculateAwards(gd);
          const chaosAgent = awards.find((a) => a.name === "Chaos Agent");

          const authorRoundCounts = getAuthorRoundCounts(gd.roundMessages);

          // Check if any player has 2+ rounds
          let anyWith2Rounds = false;
          for (const [, counts] of authorRoundCounts) {
            if (counts.length >= 2) {
              anyWith2Rounds = true;
              break;
            }
          }

          if (!anyWith2Rounds) {
            expect(chaosAgent).toBeUndefined();
          } else if (chaosAgent) {
            // All winners must have at least 2 rounds of submissions
            for (const winnerId of chaosAgent.winners) {
              const rounds = authorRoundCounts.get(winnerId) ?? [];
              expect(rounds.length).toBeGreaterThanOrEqual(2);
            }
          }
          // Note: Chaos Agent may also be absent if all stdDevs are 0
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Tie handling: when multiple players tie for an award metric, ALL tied players appear in winners", () => {
    fc.assert(
      fc.property(arbPlayerIds, (playerIds) => {
        // Create a scenario where all players have the same reaction count (tie)
        const cycle = arbCycle(playerIds);

        // Give every player exactly 1 reaction on their received message
        const roundMessages = new Map<number, RoundMessage[]>();
        const messages: RoundMessage[] = playerIds.map((id, idx) => ({
          authorId: id,
          targetId: cycle.get(id)!,
          text: "test message",
          submittedAt: 1000,
          reactions: new Map([
            ["❤️", new Set([playerIds[(idx + 2) % playerIds.length]])]
          ]),
        }));
        roundMessages.set(1, messages);
        roundMessages.set(2, messages.map((m) => ({ ...m, reactions: new Map() })));

        // All guesses wrong so Most Mysterious appears
        const guesses = new Map<string, string>();
        for (const [admirerId, targetId] of cycle) {
          const wrongGuess = playerIds.find((p) => p !== admirerId && p !== targetId);
          if (wrongGuess) guesses.set(targetId, wrongGuess);
        }

        const playerNames = new Map<string, string>();
        for (const id of playerIds) playerNames.set(id, `Player_${id}`);

        const gameData: GameData = { roundMessages, guesses, cycle, playerNames };
        const awards = calculateAwards(gameData);

        // Every target gets exactly 1 reaction, so all targets are tied for Biggest Flirt
        const biggestFlirt = awards.find((a) => a.name === "Biggest Flirt");
        if (biggestFlirt) {
          // All targets should be tied - verify all tied players are included
          const reactionsByTarget = getTotalReactionsByTarget(roundMessages);
          let maxReactions = 0;
          for (const count of reactionsByTarget.values()) {
            if (count > maxReactions) maxReactions = count;
          }
          const expectedWinners = new Set<string>();
          for (const [playerId, count] of reactionsByTarget) {
            if (count === maxReactions) expectedWinners.add(playerId);
          }
          expect(new Set(biggestFlirt.winners)).toEqual(expectedWinners);
        }

        // All messages have 1 reaction, so all authors are tied for Best Compliment
        const bestCompliment = awards.find((a) => a.name === "Best Compliment");
        if (bestCompliment) {
          const { authorIds } = getMaxSingleMessageReaction(roundMessages);
          expect(new Set(bestCompliment.winners)).toEqual(authorIds);
        }
      }),
      { numRuns: 100 }
    );
  });
});
