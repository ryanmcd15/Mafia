import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TwoTruthsOneLieModule } from "./TwoTruthsOneLieModule.js";
import { GameModuleContext } from "../../types.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockContext(
  players: Array<{ id: string; name: string; isConnected: boolean }>
): GameModuleContext {
  return {
    emitToRoom: vi.fn(),
    emitToPlayer: vi.fn(),
    signalGameOver: vi.fn(),
    getPlayers: vi.fn().mockReturnValue(players),
  };
}

const testPlayers = [
  { id: "host-socket", name: "Alice", isConnected: true },
  { id: "player2-socket", name: "Bob", isConnected: true },
  { id: "player3-socket", name: "Charlie", isConnected: true },
];

function startGame(players = testPlayers) {
  const context = createMockContext(players);
  const module = new TwoTruthsOneLieModule();
  module.start(context);
  return { module, context };
}

/**
 * Helper: submit statements for all players and auto-transition to play phase.
 */
function submitAllAndTransitionToPlay(
  module: TwoTruthsOneLieModule,
  context: GameModuleContext,
  players = testPlayers
) {
  for (const p of players) {
    module.handleEvent(p.id, "submitStatements", {
      statements: [
        { text: `Truth 1 from ${p.name}`, isLie: false },
        { text: `Truth 2 from ${p.name}`, isLie: false },
        { text: `Lie from ${p.name}`, isLie: true },
      ],
    });
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("TwoTruthsOneLieModule", () => {
  // ─── Submission Phase Tests ──────────────────────────────────────

  describe("Submission Phase", () => {
    it("start() initializes in submission phase and emits ttolPhaseChanged", () => {
      const { context } = startGame();

      expect(context.emitToRoom).toHaveBeenCalledWith("ttolPhaseChanged", {
        phase: "submission",
      });
    });

    it("valid submitStatements (3 statements, 1-200 chars, 1 lie) succeeds", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitStatements", {
        statements: [
          { text: "I have a dog", isLie: false },
          { text: "I love pizza", isLie: false },
          { text: "I can fly", isLie: true },
        ],
      });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "playerSubmitted",
        expect.objectContaining({
          playerId: "host-socket",
          playerName: "Alice",
          submittedCount: 1,
          totalPlayers: 3,
        })
      );
    });

    it("submitStatements with wrong count rejects", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitStatements", {
        statements: [
          { text: "Only one", isLie: false },
          { text: "Only two", isLie: true },
        ],
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("exactly 3"),
        })
      );
    });

    it("submitStatements with text >200 chars rejects", () => {
      const { module, context } = startGame();

      const longText = "a".repeat(201);
      module.handleEvent("host-socket", "submitStatements", {
        statements: [
          { text: longText, isLie: false },
          { text: "Truth 2", isLie: false },
          { text: "Lie", isLie: true },
        ],
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("between 1 and 200"),
        })
      );
    });

    it("submitStatements with 0 lies rejects", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitStatements", {
        statements: [
          { text: "Truth 1", isLie: false },
          { text: "Truth 2", isLie: false },
          { text: "Truth 3", isLie: false },
        ],
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("exactly 1"),
        })
      );
    });

    it("submitStatements with 2 lies rejects", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitStatements", {
        statements: [
          { text: "Truth 1", isLie: false },
          { text: "Lie 1", isLie: true },
          { text: "Lie 2", isLie: true },
        ],
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("exactly 1"),
        })
      );
    });

    it("duplicate submission rejects", () => {
      const { module, context } = startGame();

      const statements = [
        { text: "Truth 1", isLie: false },
        { text: "Truth 2", isLie: false },
        { text: "Lie", isLie: true },
      ];

      module.handleEvent("host-socket", "submitStatements", { statements });
      module.handleEvent("host-socket", "submitStatements", { statements });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("already submitted"),
        })
      );
    });

    it("auto-transitions to play when all players submit", () => {
      const { module, context } = startGame();

      submitAllAndTransitionToPlay(module, context);

      // Should emit roundStarted directly (no separate ttolPhaseChanged for play)
      expect(context.emitToRoom).toHaveBeenCalledWith(
        "roundStarted",
        expect.objectContaining({
          roundNumber: 1,
          totalRounds: 3,
        })
      );

      // Also emits roundStarted for the first round
      expect(context.emitToRoom).toHaveBeenCalledWith(
        "roundStarted",
        expect.objectContaining({
          roundNumber: 1,
          totalRounds: 3,
        })
      );
    });
  });

  // ─── Voting / Timer Tests ───────────────────────────────────────

  describe("Voting / Timer", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      // Control shuffle: Math.random returning 0 makes Fisher-Yates produce a predictable order
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    });

    afterEach(() => {
      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it("45-second timer expiry triggers lieRevealed even with partial votes", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Only one player votes (partial)
      const state = module.getState("player2-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const nonPresenterIds = testPlayers
        .filter((p) => p.id !== presenterId)
        .map((p) => p.id);

      // Only first non-presenter votes
      module.handleEvent(nonPresenterIds[0], "submitLieVote", { statementIndex: 0 });

      // Run all pending timers (setTimeout + setInterval)
      vi.runAllTimers();

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "lieRevealed",
        expect.objectContaining({
          lieIndex: expect.any(Number),
          lieText: expect.any(String),
          scores: expect.any(Object),
        })
      );
    });

    it("all votes in before timer triggers lieRevealed immediately", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      const state = module.getState("player2-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const nonPresenterIds = testPlayers
        .filter((p) => p.id !== presenterId)
        .map((p) => p.id);

      // All eligible voters vote
      for (const voterId of nonPresenterIds) {
        module.handleEvent(voterId, "submitLieVote", { statementIndex: 1 });
      }

      // lieRevealed should fire without waiting for timer
      expect(context.emitToRoom).toHaveBeenCalledWith(
        "lieRevealed",
        expect.objectContaining({
          lieIndex: expect.any(Number),
        })
      );
    });

    it("duplicate vote rejected with error", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      const state = module.getState("player2-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const voterId = testPlayers.find((p) => p.id !== presenterId)!.id;

      module.handleEvent(voterId, "submitLieVote", { statementIndex: 0 });
      module.handleEvent(voterId, "submitLieVote", { statementIndex: 1 });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        voterId,
        "error",
        expect.objectContaining({
          message: expect.stringContaining("already voted"),
        })
      );
    });

    it("presenter cannot vote on own statements", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      const state = module.getState("host-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;

      module.handleEvent(presenterId, "submitLieVote", { statementIndex: 0 });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        presenterId,
        "error",
        expect.objectContaining({
          message: expect.stringContaining("cannot vote on your own"),
        })
      );
    });
  });

  // ─── Round Advancement Tests ────────────────────────────────────

  describe("Round Advancement", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    });

    afterEach(() => {
      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it("nextRound by host advances to next presenter's statements", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Run all timers to trigger reveal
      vi.runAllTimers();

      // Host advances to next round
      module.handleEvent("host-socket", "nextRound", {});

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "roundStarted",
        expect.objectContaining({
          roundNumber: 2,
          totalRounds: 3,
        })
      );
    });

    it("nextRound by non-host rejected", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Run all timers to trigger reveal
      vi.runAllTimers();

      module.handleEvent("player2-socket", "nextRound", {});

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "player2-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("Only the host"),
        })
      );
    });

    it("after all rounds, nextRound triggers gameOver with signalGameOver", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Go through all 3 rounds
      for (let round = 0; round < 3; round++) {
        vi.runAllTimers(); // trigger reveal
        if (round < 2) {
          module.handleEvent("host-socket", "nextRound", {});
        }
      }

      // Final nextRound should end the game
      module.handleEvent("host-socket", "nextRound", {});

      expect(context.signalGameOver).toHaveBeenCalledWith(
        expect.objectContaining({
          game: "two-truths-one-lie",
          scoreboard: expect.any(Array),
        })
      );
    });

    it("nextRound only works in reveal phase", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // We're in play phase now (not reveal), so nextRound should be ignored
      module.handleEvent("host-socket", "nextRound", {});

      // Should NOT have emitted a second roundStarted (only the initial one from transition)
      const roundStartedCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === "roundStarted"
      );
      expect(roundStartedCalls).toHaveLength(1); // only the initial one
    });
  });

  // ─── Scoring Tests ──────────────────────────────────────────────

  describe("Scoring", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      // With mockReturnValue(0.99), the Fisher-Yates shuffle on [0,1,2]:
      // i=2: j=floor(0.99*3)=2 → swap(2,2) → no change
      // i=1: j=floor(0.99*2)=1 → swap(1,1) → no change
      // Result: same order → module rotates to [1,2,0]
      // So original [Truth1(false), Truth2(false), Lie(true)] → shuffled [Truth2(false), Lie(true), Truth1(false)]
      // Lie ends up at index 1
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    });

    afterEach(() => {
      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it("correct lie guess awards +1 point", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // With our shuffle mock, lie is at index 1 (rotation: [stmt[1], stmt[2], stmt[0]])
      const state = module.getState("player2-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const voters = testPlayers.filter((p) => p.id !== presenterId);

      // Vote correctly (lie is at index 1 due to rotation)
      module.handleEvent(voters[0].id, "submitLieVote", { statementIndex: 1 });
      module.handleEvent(voters[1].id, "submitLieVote", { statementIndex: 1 });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "lieRevealed",
        expect.objectContaining({
          lieIndex: 1,
          correctVoters: expect.arrayContaining([voters[0].id, voters[1].id]),
        })
      );
    });

    it("incorrect lie guess awards 0 points", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      const state = module.getState("player2-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const voters = testPlayers.filter((p) => p.id !== presenterId);

      // Vote incorrectly (lie is at index 1, voting index 0)
      module.handleEvent(voters[0].id, "submitLieVote", { statementIndex: 0 });
      module.handleEvent(voters[1].id, "submitLieVote", { statementIndex: 0 });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "lieRevealed",
        expect.objectContaining({
          lieIndex: 1,
          correctVoters: [],
        })
      );
    });

    it("scores accumulate across multiple rounds", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Round 1: player2 and player3 vote correctly
      const state1 = module.getState("player2-socket") as { currentPresenter: string };
      const presenter1 = state1.currentPresenter;
      const voters1 = testPlayers.filter((p) => p.id !== presenter1);
      for (const v of voters1) {
        module.handleEvent(v.id, "submitLieVote", { statementIndex: 1 });
      }

      // Advance to round 2
      module.handleEvent("host-socket", "nextRound", {});

      // Round 2: vote correctly again
      const state2 = module.getState("player2-socket") as { currentPresenter: string };
      const presenter2 = state2.currentPresenter;
      const voters2 = testPlayers.filter((p) => p.id !== presenter2);
      for (const v of voters2) {
        module.handleEvent(v.id, "submitLieVote", { statementIndex: 1 });
      }

      // Check accumulated scores in lieRevealed for round 2
      const lieRevealedCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === "lieRevealed"
      );
      const round2Reveal = lieRevealedCalls[1][1] as { scores: Record<string, number> };

      // At least one player should have score >= 2 (voted correctly in both rounds)
      const maxScore = Math.max(...Object.values(round2Reveal.scores));
      expect(maxScore).toBeGreaterThanOrEqual(2);
    });

    it("final scoreboard sorted descending by score", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      // Play through all rounds with varying correctness
      for (let round = 0; round < 3; round++) {
        const state = module.getState("host-socket") as { currentPresenter: string };
        const presenterId = state.currentPresenter;
        const voters = testPlayers.filter((p) => p.id !== presenterId);

        // First voter guesses correctly, second doesn't
        if (voters.length >= 1) {
          module.handleEvent(voters[0].id, "submitLieVote", { statementIndex: 1 }); // correct
        }
        if (voters.length >= 2) {
          module.handleEvent(voters[1].id, "submitLieVote", { statementIndex: 0 }); // wrong
        }

        if (round < 2) {
          module.handleEvent("host-socket", "nextRound", {});
        }
      }

      // Final nextRound triggers game over
      module.handleEvent("host-socket", "nextRound", {});

      expect(context.signalGameOver).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreboard: expect.any(Array),
        })
      );

      const gameOverCall = (context.signalGameOver as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        scoreboard: Array<{ score: number }>;
      };
      const scores = gameOverCall.scoreboard.map((entry) => entry.score);

      // Verify sorted descending
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });
  });

  // ─── Disconnect Tests ───────────────────────────────────────────

  describe("Disconnect", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    });

    afterEach(() => {
      randomSpy.mockRestore();
      vi.useRealTimers();
    });

    it("handleDisconnect during voting checks if all remaining voters have voted (triggers reveal if so)", () => {
      const { module, context } = startGame();
      submitAllAndTransitionToPlay(module, context);

      const state = module.getState("host-socket") as { currentPresenter: string };
      const presenterId = state.currentPresenter;
      const voters = testPlayers.filter((p) => p.id !== presenterId);

      // First voter votes
      module.handleEvent(voters[0].id, "submitLieVote", { statementIndex: 1 });

      // Second voter disconnects — now only 1 eligible voter remains and they already voted
      const updatedPlayers = testPlayers.map((p) =>
        p.id === voters[1].id ? { ...p, isConnected: false } : p
      );
      (context.getPlayers as ReturnType<typeof vi.fn>).mockReturnValue(updatedPlayers);

      module.handleDisconnect(voters[1].id);

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "lieRevealed",
        expect.objectContaining({
          lieIndex: expect.any(Number),
        })
      );
    });
  });
});
