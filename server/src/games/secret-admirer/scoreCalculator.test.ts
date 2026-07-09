import { describe, it, expect } from "vitest";
import {
  calculateRoundScores,
  calculateGuessScores,
  buildLeaderboard,
} from "./scoreCalculator.js";

describe("calculateRoundScores", () => {
  it("awards 2 pts to the author with the most votes", () => {
    const votes = new Map([
      ["voter1", "authorA"],
      ["voter2", "authorA"],
      ["voter3", "authorB"],
    ]);
    const reactions = new Map<string, Map<string, Set<string>>>();

    const updates = calculateRoundScores(votes, reactions);

    expect(updates).toContainEqual({ playerId: "authorA", points: 2, reason: "community_vote" });
    expect(updates).not.toContainEqual(expect.objectContaining({ playerId: "authorB", reason: "community_vote" }));
  });

  it("awards 2 pts to all tied vote winners", () => {
    const votes = new Map([
      ["voter1", "authorA"],
      ["voter2", "authorB"],
    ]);
    const reactions = new Map<string, Map<string, Set<string>>>();

    const updates = calculateRoundScores(votes, reactions);

    const voteUpdates = updates.filter((u) => u.reason === "community_vote");
    expect(voteUpdates).toHaveLength(2);
    expect(voteUpdates).toContainEqual({ playerId: "authorA", points: 2, reason: "community_vote" });
    expect(voteUpdates).toContainEqual({ playerId: "authorB", points: 2, reason: "community_vote" });
  });

  it("awards no vote points when votes map is empty", () => {
    const votes = new Map<string, string>();
    const reactions = new Map<string, Map<string, Set<string>>>();

    const updates = calculateRoundScores(votes, reactions);
    const voteUpdates = updates.filter((u) => u.reason === "community_vote");
    expect(voteUpdates).toHaveLength(0);
  });

  it("awards 2 pts to the author with the most total reactions", () => {
    const votes = new Map<string, string>();
    const reactions = new Map<string, Map<string, Set<string>>>([
      ["authorA", new Map([
        ["❤️", new Set(["p1", "p2", "p3"])],
        ["😂", new Set(["p1"])],
      ])],
      ["authorB", new Map([
        ["❤️", new Set(["p1"])],
      ])],
    ]);

    const updates = calculateRoundScores(votes, reactions);

    expect(updates).toContainEqual({ playerId: "authorA", points: 2, reason: "most_reactions" });
    expect(updates).not.toContainEqual(expect.objectContaining({ playerId: "authorB", reason: "most_reactions" }));
  });

  it("awards 2 pts to all tied reaction winners", () => {
    const votes = new Map<string, string>();
    const reactions = new Map<string, Map<string, Set<string>>>([
      ["authorA", new Map([["❤️", new Set(["p1", "p2"])]])],
      ["authorB", new Map([["😂", new Set(["p3", "p4"])]])],
    ]);

    const updates = calculateRoundScores(votes, reactions);

    const reactionUpdates = updates.filter((u) => u.reason === "most_reactions");
    expect(reactionUpdates).toHaveLength(2);
    expect(reactionUpdates).toContainEqual({ playerId: "authorA", points: 2, reason: "most_reactions" });
    expect(reactionUpdates).toContainEqual({ playerId: "authorB", points: 2, reason: "most_reactions" });
  });

  it("awards no reaction points when reactions map is empty", () => {
    const votes = new Map<string, string>();
    const reactions = new Map<string, Map<string, Set<string>>>();

    const updates = calculateRoundScores(votes, reactions);
    const reactionUpdates = updates.filter((u) => u.reason === "most_reactions");
    expect(reactionUpdates).toHaveLength(0);
  });

  it("awards no reaction points when all authors have zero reactions", () => {
    const votes = new Map<string, string>();
    const reactions = new Map<string, Map<string, Set<string>>>([
      ["authorA", new Map([["❤️", new Set()]])],
      ["authorB", new Map()],
    ]);

    const updates = calculateRoundScores(votes, reactions);
    const reactionUpdates = updates.filter((u) => u.reason === "most_reactions");
    expect(reactionUpdates).toHaveLength(0);
  });
});

describe("calculateGuessScores", () => {
  it("awards 5 pts for a correct guess", () => {
    // cycle: A → B (A admires B), C → A (C admires A)
    const cycle = new Map([
      ["A", "B"],
      ["C", "A"],
    ]);
    // Player A's admirer is C (because C → A in cycle)
    const guesses = new Map([["A", "C"]]);

    const updates = calculateGuessScores(guesses, cycle);

    expect(updates).toContainEqual({ playerId: "A", points: 5, reason: "correct_guess" });
  });

  it("awards no points for an incorrect guess", () => {
    const cycle = new Map([
      ["A", "B"],
      ["B", "C"],
      ["C", "A"],
    ]);
    // Player A's admirer is C, but they guess B
    const guesses = new Map([["A", "B"]]);

    const updates = calculateGuessScores(guesses, cycle);
    expect(updates).toHaveLength(0);
  });

  it("awards multiple players for correct guesses", () => {
    const cycle = new Map([
      ["A", "B"],
      ["B", "C"],
      ["C", "A"],
    ]);
    // A's admirer is C, B's admirer is A, C's admirer is B
    const guesses = new Map([
      ["A", "C"], // correct
      ["B", "A"], // correct
      ["C", "A"], // incorrect (should be B)
    ]);

    const updates = calculateGuessScores(guesses, cycle);
    expect(updates).toHaveLength(2);
    expect(updates).toContainEqual({ playerId: "A", points: 5, reason: "correct_guess" });
    expect(updates).toContainEqual({ playerId: "B", points: 5, reason: "correct_guess" });
  });

  it("returns empty array when no guesses are submitted", () => {
    const cycle = new Map([["A", "B"], ["B", "A"]]);
    const guesses = new Map<string, string>();

    const updates = calculateGuessScores(guesses, cycle);
    expect(updates).toHaveLength(0);
  });
});

describe("buildLeaderboard", () => {
  it("sorts players by score descending", () => {
    const scores = new Map([
      ["p1", 10],
      ["p2", 20],
      ["p3", 5],
    ]);
    const names = new Map([
      ["p1", "Alice"],
      ["p2", "Bob"],
      ["p3", "Charlie"],
    ]);

    const leaderboard = buildLeaderboard(scores, names);

    expect(leaderboard[0].playerId).toBe("p2");
    expect(leaderboard[1].playerId).toBe("p1");
    expect(leaderboard[2].playerId).toBe("p3");
  });

  it("breaks ties alphabetically by player name", () => {
    const scores = new Map([
      ["p1", 10],
      ["p2", 10],
      ["p3", 10],
    ]);
    const names = new Map([
      ["p1", "Charlie"],
      ["p2", "Alice"],
      ["p3", "Bob"],
    ]);

    const leaderboard = buildLeaderboard(scores, names);

    expect(leaderboard[0].playerName).toBe("Alice");
    expect(leaderboard[1].playerName).toBe("Bob");
    expect(leaderboard[2].playerName).toBe("Charlie");
  });

  it("assigns correct rank numbers with ties sharing rank", () => {
    const scores = new Map([
      ["p1", 20],
      ["p2", 15],
      ["p3", 15],
      ["p4", 5],
    ]);
    const names = new Map([
      ["p1", "Alice"],
      ["p2", "Bob"],
      ["p3", "Charlie"],
      ["p4", "Dave"],
    ]);

    const leaderboard = buildLeaderboard(scores, names);

    expect(leaderboard[0]).toMatchObject({ playerName: "Alice", rank: 1, score: 20 });
    expect(leaderboard[1]).toMatchObject({ playerName: "Bob", rank: 2, score: 15 });
    expect(leaderboard[2]).toMatchObject({ playerName: "Charlie", rank: 2, score: 15 });
    expect(leaderboard[3]).toMatchObject({ playerName: "Dave", rank: 4, score: 5 });
  });

  it("handles empty scores map", () => {
    const scores = new Map<string, number>();
    const names = new Map<string, string>();

    const leaderboard = buildLeaderboard(scores, names);
    expect(leaderboard).toHaveLength(0);
  });

  it("uses playerId as fallback when playerName not found", () => {
    const scores = new Map([["unknown-player", 10]]);
    const names = new Map<string, string>();

    const leaderboard = buildLeaderboard(scores, names);
    expect(leaderboard[0].playerName).toBe("unknown-player");
  });
});
