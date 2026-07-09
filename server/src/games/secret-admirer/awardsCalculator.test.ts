import { describe, it, expect } from "vitest";
import { calculateAwards, type GameData } from "./awardsCalculator.js";

function makeReactions(counts: Record<string, string[]>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [emoji, reactors] of Object.entries(counts)) {
    map.set(emoji, new Set(reactors));
  }
  return map;
}

function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    roundMessages: new Map(),
    guesses: new Map(),
    cycle: new Map(),
    playerNames: new Map([
      ["p1", "Alice"],
      ["p2", "Bob"],
      ["p3", "Charlie"],
    ]),
    ...overrides,
  };
}

describe("awardsCalculator", () => {
  describe("calculateAwards", () => {
    it("returns empty array when no messages or data", () => {
      const gameData = makeGameData();
      const awards = calculateAwards(gameData);
      expect(awards).toEqual([]);
    });

    describe("Biggest Flirt", () => {
      it("awards to the player who received the most reactions as a target", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"], "😂": ["p2"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3"] }),
            },
            {
              authorId: "p3", targetId: "p1", text: "hey", submittedAt: 300,
              reactions: makeReactions({}),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const biggestFlirt = awards.find((a) => a.name === "Biggest Flirt");

        expect(biggestFlirt).toBeDefined();
        expect(biggestFlirt!.winners).toEqual(["p2"]); // p2 received 2 reactions
      });

      it("awards to all tied players", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const biggestFlirt = awards.find((a) => a.name === "Biggest Flirt");

        expect(biggestFlirt).toBeDefined();
        expect(biggestFlirt!.winners.sort()).toEqual(["p2", "p3"]);
      });

      it("omitted when no reactions exist", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({}),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const biggestFlirt = awards.find((a) => a.name === "Biggest Flirt");
        expect(biggestFlirt).toBeUndefined();
      });
    });

    describe("Most Mysterious", () => {
      it("awards to admirers whose targets guessed incorrectly", () => {
        // cycle: p1 admires p2, p2 admires p3, p3 admires p1
        const cycle = new Map([["p1", "p2"], ["p2", "p3"], ["p3", "p1"]]);
        // p2 guesses p3 (wrong, admirer is p1), p3 guesses p2 (correct), p1 guesses p3 (correct)
        const guesses = new Map([["p2", "p3"], ["p3", "p2"], ["p1", "p3"]]);

        const gameData = makeGameData({ cycle, guesses });
        const awards = calculateAwards(gameData);
        const mysterious = awards.find((a) => a.name === "Most Mysterious");

        expect(mysterious).toBeDefined();
        // p1 is the admirer of p2, and p2 guessed p3 (wrong), so p1 is mysterious
        expect(mysterious!.winners).toEqual(["p1"]);
      });

      it("awards to all mysterious admirers when multiple targets guess wrong", () => {
        const cycle = new Map([["p1", "p2"], ["p2", "p3"], ["p3", "p1"]]);
        // All guesses wrong
        const guesses = new Map([["p2", "p3"], ["p3", "p1"], ["p1", "p2"]]);

        const gameData = makeGameData({ cycle, guesses });
        const awards = calculateAwards(gameData);
        const mysterious = awards.find((a) => a.name === "Most Mysterious");

        expect(mysterious).toBeDefined();
        expect(mysterious!.winners.sort()).toEqual(["p1", "p2", "p3"]);
      });

      it("omitted when all admirers were correctly guessed", () => {
        // cycle: p1→p2, p2→p3, p3→p1
        const cycle = new Map([["p1", "p2"], ["p2", "p3"], ["p3", "p1"]]);
        // All correct: p2 guesses p1 (correct admirer), p3 guesses p2, p1 guesses p3
        const guesses = new Map([["p2", "p1"], ["p3", "p2"], ["p1", "p3"]]);

        const gameData = makeGameData({ cycle, guesses });
        const awards = calculateAwards(gameData);
        const mysterious = awards.find((a) => a.name === "Most Mysterious");

        expect(mysterious).toBeUndefined();
      });

      it("handles players who did not submit a guess (treated as wrong)", () => {
        const cycle = new Map([["p1", "p2"], ["p2", "p3"], ["p3", "p1"]]);
        // p2 didn't guess at all, p3 and p1 guessed correctly
        const guesses = new Map([["p3", "p2"], ["p1", "p3"]]);

        const gameData = makeGameData({ cycle, guesses });
        const awards = calculateAwards(gameData);
        const mysterious = awards.find((a) => a.name === "Most Mysterious");

        expect(mysterious).toBeDefined();
        // p1 admires p2, and p2 didn't guess → p1 is mysterious
        expect(mysterious!.winners).toEqual(["p1"]);
      });
    });

    describe("Best Compliment", () => {
      it("awards to the author of the message with most reactions", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "you're great", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"], "😍": ["p2"], "🔥": ["p2"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "cool person", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const best = awards.find((a) => a.name === "Best Compliment");

        expect(best).toBeDefined();
        expect(best!.winners).toEqual(["p1"]);
      });

      it("awards to all tied authors when multiple messages have the same max reactions", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2", "p3"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p1", "p3"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const best = awards.find((a) => a.name === "Best Compliment");

        expect(best).toBeDefined();
        expect(best!.winners.sort()).toEqual(["p1", "p2"]);
      });

      it("omitted when no messages have reactions", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({}),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const best = awards.find((a) => a.name === "Best Compliment");
        expect(best).toBeUndefined();
      });
    });

    describe("Chaos Agent", () => {
      it("awards to the player with highest std dev of reaction counts across rounds", () => {
        // p1 gets 0 reactions in round 1 and 10 in round 2 (high variance)
        // p2 gets 3 reactions in round 1 and 3 in round 2 (low variance)
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({}), // 0 reactions
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3", "p1", "p2"] }), // 3 reactions
            },
          ]],
          [2, [
            {
              authorId: "p1", targetId: "p2", text: "wow", submittedAt: 100,
              reactions: makeReactions({
                "❤️": ["p2", "p3"],
                "😂": ["p2", "p3"],
                "😍": ["p2", "p3"],
                "🔥": ["p2", "p3"],
                "👀": ["p2"],
                "💀": ["p3"],
              }), // 10 reactions
            },
            {
              authorId: "p2", targetId: "p3", text: "ok", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p1", "p3", "p2"] }), // 3 reactions
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const chaos = awards.find((a) => a.name === "Chaos Agent");

        expect(chaos).toBeDefined();
        expect(chaos!.winners).toEqual(["p1"]); // std dev of [0, 10] = 5, vs [3, 3] = 0
      });

      it("omitted when no player has 2+ rounds of submissions", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const chaos = awards.find((a) => a.name === "Chaos Agent");
        expect(chaos).toBeUndefined();
      });

      it("omitted when all players have zero std dev", () => {
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"] }),
            },
          ]],
          [2, [
            {
              authorId: "p1", targetId: "p2", text: "hey", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const chaos = awards.find((a) => a.name === "Chaos Agent");
        expect(chaos).toBeUndefined();
      });

      it("awards to all tied players with same highest std dev", () => {
        // Both p1 and p2 get [0, 4] reactions across rounds → same std dev
        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({}),
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({}),
            },
          ]],
          [2, [
            {
              authorId: "p1", targetId: "p2", text: "wow", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2", "p3"], "😂": ["p2", "p3"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "ok", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p1", "p3"], "😂": ["p1", "p3"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ roundMessages });
        const awards = calculateAwards(gameData);
        const chaos = awards.find((a) => a.name === "Chaos Agent");

        expect(chaos).toBeDefined();
        expect(chaos!.winners.sort()).toEqual(["p1", "p2"]);
      });
    });

    describe("combined awards", () => {
      it("returns all applicable awards together", () => {
        const cycle = new Map([["p1", "p2"], ["p2", "p3"], ["p3", "p1"]]);
        const guesses = new Map([["p2", "p3"], ["p3", "p2"], ["p1", "p3"]]); // p2 guessed wrong

        const roundMessages = new Map([
          [1, [
            {
              authorId: "p1", targetId: "p2", text: "hi", submittedAt: 100,
              reactions: makeReactions({ "❤️": ["p2", "p3"] }),
            },
            {
              authorId: "p2", targetId: "p3", text: "yo", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3"] }),
            },
            {
              authorId: "p3", targetId: "p1", text: "hey", submittedAt: 300,
              reactions: makeReactions({ "❤️": ["p1"] }),
            },
          ]],
          [2, [
            {
              authorId: "p1", targetId: "p2", text: "again", submittedAt: 100,
              reactions: makeReactions({}),
            },
            {
              authorId: "p2", targetId: "p3", text: "more", submittedAt: 200,
              reactions: makeReactions({ "❤️": ["p3"] }),
            },
            {
              authorId: "p3", targetId: "p1", text: "sup", submittedAt: 300,
              reactions: makeReactions({ "❤️": ["p1"] }),
            },
          ]],
        ]);

        const gameData = makeGameData({ cycle, guesses, roundMessages });
        const awards = calculateAwards(gameData);

        const names = awards.map((a) => a.name);
        expect(names).toContain("Biggest Flirt");
        expect(names).toContain("Most Mysterious");
        expect(names).toContain("Best Compliment");
        expect(names).toContain("Chaos Agent");
      });
    });
  });
});
