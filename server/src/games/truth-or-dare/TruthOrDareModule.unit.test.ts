import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TruthOrDareModule } from "./TruthOrDareModule.js";
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
  const module = new TruthOrDareModule();
  module.start(context);
  return { module, context };
}

/**
 * Helper to transition the game from submission to play phase.
 * Each player submits one prompt and readies up.
 */
function transitionToPlay(players = testPlayers) {
  const { module, context } = startGame(players);

  // Each player submits a prompt and readies
  for (const p of players) {
    module.handleEvent(p.id, "submitPrompt", {
      text: `Prompt from ${p.name}`,
      category: p.name === "Alice" ? "truth" : "dare",
    });
    module.handleEvent(p.id, "playerReady", {});
  }

  return { module, context };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("TruthOrDareModule", () => {
  // ─── Submission Phase Tests ──────────────────────────────────────

  describe("Submission Phase", () => {
    it("start() initializes in submission phase and emits truthOrDareStarted", () => {
      const { context } = startGame();

      expect(context.emitToRoom).toHaveBeenCalledWith("truthOrDareStarted", {
        phase: "submission",
        hostId: "host-socket",
      });
    });

    it("submitPrompt with valid text succeeds and emits promptSubmitted", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitPrompt", {
        text: "What is your biggest fear?",
        category: "truth",
      });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "promptSubmitted",
        expect.objectContaining({
          playerId: "host-socket",
          count: 1,
          totalPrompts: 1,
        })
      );
    });

    it("submitPrompt with empty text rejects with error", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitPrompt", {
        text: "",
        category: "truth",
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("between 1 and 280"),
        })
      );
    });

    it("submitPrompt with text >280 chars rejects with error", () => {
      const { module, context } = startGame();

      const longText = "a".repeat(281);
      module.handleEvent("host-socket", "submitPrompt", {
        text: longText,
        category: "dare",
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("between 1 and 280"),
        })
      );
    });

    it("playerReady with 0 submissions rejects with error", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "playerReady", {});

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "host-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("at least 1 prompt"),
        })
      );
    });

    it("playerReady after 1+ submissions succeeds and emits playerReadyUpdate", () => {
      const { module, context } = startGame();

      module.handleEvent("host-socket", "submitPrompt", {
        text: "Tell a secret",
        category: "truth",
      });
      module.handleEvent("host-socket", "playerReady", {});

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "playerReadyUpdate",
        expect.objectContaining({
          playerId: "host-socket",
          readyPlayers: ["host-socket"],
        })
      );
    });

    it("all players ready transitions to play phase (emits phaseChanged)", () => {
      const { context } = transitionToPlay();

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "todPhaseChanged",
        expect.objectContaining({
          phase: "play",
        })
      );
    });
  });

  // ─── Play Phase Tests ────────────────────────────────────────────

  describe("Play Phase", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
      randomSpy.mockRestore();
    });

    it("spinWheel by host selects a player and emits wheelResult", () => {
      const { module, context } = transitionToPlay();

      module.handleEvent("host-socket", "spinWheel", {});

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "wheelResult",
        expect.objectContaining({
          selectedPlayer: expect.any(String),
          selectedPlayerName: expect.any(String),
        })
      );
    });

    it("spinWheel by non-host rejects with error", () => {
      const { module, context } = transitionToPlay();

      module.handleEvent("player2-socket", "spinWheel", {});

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "player2-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("Only the host"),
        })
      );
    });

    it("choiceSelected by selected player with 'truth' picks a truth prompt and emits promptRevealed", () => {
      const players = [
        { id: "host-socket", name: "Alice", isConnected: true },
        { id: "player2-socket", name: "Bob", isConnected: true },
        { id: "player3-socket", name: "Charlie", isConnected: true },
      ];
      const { module, context } = startGame(players);

      // Submit only truth prompts
      for (const p of players) {
        module.handleEvent(p.id, "submitPrompt", {
          text: `Truth from ${p.name}`,
          category: "truth",
        });
        module.handleEvent(p.id, "playerReady", {});
      }

      // Spin wheel - Math.random() = 0 selects first player
      module.handleEvent("host-socket", "spinWheel", {});

      // Selected player picks truth
      const selectedId = players[0].id;
      module.handleEvent(selectedId, "choiceSelected", { category: "truth" });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "promptRevealed",
        expect.objectContaining({
          prompt: expect.objectContaining({ category: "truth" }),
          category: "truth",
        })
      );
    });

    it("choiceSelected by non-selected player rejects with error", () => {
      const { module, context } = transitionToPlay();

      // Spin wheel (selects first player because Math.random = 0)
      module.handleEvent("host-socket", "spinWheel", {});

      // Non-selected player tries to choose
      module.handleEvent("player3-socket", "choiceSelected", {
        category: "truth",
      });

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "player3-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("Only the selected player"),
        })
      );
    });

    it("nextTurn by host resets turn state and emits nextTurnStarted", () => {
      const { module, context } = transitionToPlay();

      // Spin, choose, then advance
      module.handleEvent("host-socket", "spinWheel", {});
      const selectedId = testPlayers[0].id;
      module.handleEvent(selectedId, "choiceSelected", { category: "dare" });

      module.handleEvent("host-socket", "nextTurn", {});

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "nextTurnStarted",
        expect.objectContaining({
          promptsRemaining: expect.any(Number),
        })
      );
    });

    it("nextTurn by non-host rejects with error", () => {
      const { module, context } = transitionToPlay();

      module.handleEvent("player2-socket", "nextTurn", {});

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "player2-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("Only the host"),
        })
      );
    });
  });

  // ─── End Game Tests ──────────────────────────────────────────────

  describe("End Game", () => {
    it("endGame by host calls signalGameOver", () => {
      const { module, context } = transitionToPlay();

      module.handleEvent("host-socket", "endGame", {});

      expect(context.signalGameOver).toHaveBeenCalledWith(
        expect.objectContaining({ game: "truth-or-dare" })
      );
    });

    it("endGame by non-host rejects with error", () => {
      const { module, context } = transitionToPlay();

      module.handleEvent("player2-socket", "endGame", {});

      expect(context.emitToPlayer).toHaveBeenCalledWith(
        "player2-socket",
        "error",
        expect.objectContaining({
          message: expect.stringContaining("Only the host"),
        })
      );
      expect(context.signalGameOver).not.toHaveBeenCalled();
    });
  });

  // ─── Fallback Tests ──────────────────────────────────────────────

  describe("Category Fallback", () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
      randomSpy.mockRestore();
    });

    it("when pool has only 'dare' prompts and player picks 'truth', falls back to a dare prompt", () => {
      const players = [
        { id: "host-socket", name: "Alice", isConnected: true },
        { id: "player2-socket", name: "Bob", isConnected: true },
      ];
      const context = createMockContext(players);
      const module = new TruthOrDareModule();
      module.start(context);

      // Submit only dare prompts
      for (const p of players) {
        module.handleEvent(p.id, "submitPrompt", {
          text: `Dare from ${p.name}`,
          category: "dare",
        });
        module.handleEvent(p.id, "playerReady", {});
      }

      // Spin and pick truth (no truth prompts exist)
      module.handleEvent("host-socket", "spinWheel", {});
      const selectedId = players[0].id;
      module.handleEvent(selectedId, "choiceSelected", { category: "truth" });

      // Should tell player no truths available, pick dare instead
      expect(context.emitToRoom).toHaveBeenCalledWith(
        "promptRevealed",
        expect.objectContaining({
          prompt: null,
          message: expect.stringContaining("No truths remaining"),
        })
      );
    });

    it("when pool has only 'truth' prompts and player picks 'dare', tells player to pick truth", () => {
      const players = [
        { id: "host-socket", name: "Alice", isConnected: true },
        { id: "player2-socket", name: "Bob", isConnected: true },
      ];
      const context = createMockContext(players);
      const module = new TruthOrDareModule();
      module.start(context);

      // Submit only truth prompts
      for (const p of players) {
        module.handleEvent(p.id, "submitPrompt", {
          text: `Truth from ${p.name}`,
          category: "truth",
        });
        module.handleEvent(p.id, "playerReady", {});
      }

      // Spin and pick dare (no dare prompts exist)
      module.handleEvent("host-socket", "spinWheel", {});
      const selectedId = players[0].id;
      module.handleEvent(selectedId, "choiceSelected", { category: "dare" });

      // Should tell player no dares available, pick truth instead
      expect(context.emitToRoom).toHaveBeenCalledWith(
        "promptRevealed",
        expect.objectContaining({
          prompt: null,
          message: expect.stringContaining("No dares remaining"),
        })
      );
    });
  });

  // ─── Disconnect Tests ────────────────────────────────────────────

  describe("Disconnect", () => {
    it("disconnected player's prompts are retained in pool", () => {
      const { module } = startGame();

      // Player submits a prompt then disconnects
      module.handleEvent("player2-socket", "submitPrompt", {
        text: "My prompt",
        category: "truth",
      });

      module.handleDisconnect("player2-socket");

      // Verify prompt is still in state
      const state = module.getState("host-socket") as Record<string, unknown>;
      const pool = state.promptPool as Array<{ submittedBy: string }>;
      expect(pool.some((p) => p.submittedBy === "player2-socket")).toBe(true);
    });

    it("if all remaining connected players are ready, disconnecting a non-ready player triggers transition", () => {
      const players = [
        { id: "host-socket", name: "Alice", isConnected: true },
        { id: "player2-socket", name: "Bob", isConnected: true },
        { id: "player3-socket", name: "Charlie", isConnected: true },
      ];
      const context = createMockContext(players);
      const module = new TruthOrDareModule();
      module.start(context);

      // Host and player2 submit and ready
      module.handleEvent("host-socket", "submitPrompt", {
        text: "Truth 1",
        category: "truth",
      });
      module.handleEvent("host-socket", "playerReady", {});

      module.handleEvent("player2-socket", "submitPrompt", {
        text: "Dare 1",
        category: "dare",
      });
      module.handleEvent("player2-socket", "playerReady", {});

      // player3 submitted but is NOT ready
      module.handleEvent("player3-socket", "submitPrompt", {
        text: "Truth 2",
        category: "truth",
      });

      // Now player3 disconnects — remaining connected players (host, player2) are all ready
      // Update context to reflect player3 as disconnected
      const updatedPlayers = [
        { id: "host-socket", name: "Alice", isConnected: true },
        { id: "player2-socket", name: "Bob", isConnected: true },
        { id: "player3-socket", name: "Charlie", isConnected: false },
      ];
      (context.getPlayers as ReturnType<typeof vi.fn>).mockReturnValue(updatedPlayers);

      module.handleDisconnect("player3-socket");

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "todPhaseChanged",
        expect.objectContaining({ phase: "play" })
      );
    });
  });
});
