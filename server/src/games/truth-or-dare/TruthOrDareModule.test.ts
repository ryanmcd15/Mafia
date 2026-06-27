import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
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

function createPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player${i}`,
    isConnected: true,
  }));
}

// ─── Property Tests ──────────────────────────────────────────────────

describe("TruthOrDareModule - Property Tests", () => {
  // Feature: party-games-platform, Property 10: Prompt text validation (1-280 chars)
  // Validates: Requirements 5.3, 5.4
  it("Property 10: valid prompts (1-280 chars) are accepted", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 280 }),
        fc.constantFrom("truth" as const, "dare" as const),
        (text, category) => {
          const players = createPlayers(2);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          module.handleEvent(players[0].id, "submitPrompt", { text, category });

          // Should NOT have emitted an error to the player
          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBe(0);

          // Should have emitted promptSubmitted to room
          expect(context.emitToRoom).toHaveBeenCalledWith(
            "promptSubmitted",
            expect.objectContaining({ playerId: players[0].id })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 10: Prompt text validation (1-280 chars)
  // Validates: Requirements 5.3, 5.4
  it("Property 10: invalid prompts (empty or >280 chars) are rejected", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.string({ minLength: 281, maxLength: 500 })
        ),
        fc.constantFrom("truth" as const, "dare" as const),
        (text, category) => {
          const players = createPlayers(2);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          module.handleEvent(players[0].id, "submitPrompt", { text, category });

          // Should have emitted an error to the player
          expect(context.emitToPlayer).toHaveBeenCalledWith(
            players[0].id,
            "error",
            expect.objectContaining({
              message: "Prompt text must be between 1 and 280 characters.",
            })
          );

          // Should NOT have emitted promptSubmitted
          expect(context.emitToRoom).not.toHaveBeenCalledWith(
            "promptSubmitted",
            expect.anything()
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 11: Ready requires minimum one submission
  // Validates: Requirements 5.5, 5.7
  it("Property 11: playerReady is rejected if no prompts submitted", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (playerCount) => {
          const players = createPlayers(playerCount);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Attempt to ready without submitting any prompt
          module.handleEvent(players[0].id, "playerReady", {});

          // Should emit error
          expect(context.emitToPlayer).toHaveBeenCalledWith(
            players[0].id,
            "error",
            expect.objectContaining({
              message: "You must submit at least 1 prompt before readying up.",
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 11: Ready requires minimum one submission
  // Validates: Requirements 5.5, 5.7
  it("Property 11: playerReady succeeds after submitting at least 1 prompt", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.constantFrom("truth" as const, "dare" as const),
        (promptCount, category) => {
          const players = createPlayers(2);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Submit prompts
          for (let i = 0; i < promptCount; i++) {
            module.handleEvent(players[0].id, "submitPrompt", {
              text: `Prompt ${i + 1}`,
              category,
            });
          }

          // Clear mocks before ready call
          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();

          // Ready should succeed
          module.handleEvent(players[0].id, "playerReady", {});

          // Should NOT emit error
          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBe(0);

          // Should emit playerReadyUpdate
          expect(context.emitToRoom).toHaveBeenCalledWith(
            "playerReadyUpdate",
            expect.objectContaining({ playerId: players[0].id })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 12: All-ready transition to play phase
  // Validates: Requirements 6.2
  it("Property 12: game transitions to play phase when all connected players are ready", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (playerCount) => {
          const players = createPlayers(playerCount);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Each player submits a prompt and readies up
          for (const player of players) {
            module.handleEvent(player.id, "submitPrompt", {
              text: "A valid prompt",
              category: "truth",
            });
            module.handleEvent(player.id, "playerReady", {});
          }

          // Should have transitioned to play phase
          expect(context.emitToRoom).toHaveBeenCalledWith(
            "todPhaseChanged",
            expect.objectContaining({ phase: "play" })
          );

          // Verify state reflects play phase
          const state = module.getState(players[0].id) as Record<string, unknown>;
          expect(state.phase).toBe("play");
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 13: Wheel spin selects valid player
  // Validates: Requirements 6.5, 6.6
  it("Property 13: spinning the wheel selects exactly one player from connected players", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (playerCount) => {
          const players = createPlayers(playerCount);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Transition to play phase: everyone submits and readies
          for (const player of players) {
            module.handleEvent(player.id, "submitPrompt", {
              text: "A valid prompt",
              category: "truth",
            });
            module.handleEvent(player.id, "playerReady", {});
          }

          // Clear mock calls
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          // Host spins the wheel (host is players[0] which is first player)
          module.handleEvent(players[0].id, "spinWheel", {});

          // Should emit wheelResult with a valid player
          const wheelCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === "wheelResult"
          );
          expect(wheelCalls.length).toBe(1);

          const wheelPayload = wheelCalls[0][1] as {
            selectedPlayer: string;
            selectedPlayerName: string;
          };

          // Selected player must be from connected players
          const playerIds = players.map((p) => p.id);
          expect(playerIds).toContain(wheelPayload.selectedPlayer);

          // Selected player name must match
          const matchingPlayer = players.find(
            (p) => p.id === wheelPayload.selectedPlayer
          );
          expect(matchingPlayer).toBeDefined();
          expect(wheelPayload.selectedPlayerName).toBe(matchingPlayer!.name);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 14: Prompt category matching
  // Validates: Requirements 6.5, 6.6
  it("Property 14: choosing a category returns a prompt of that category when available", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("truth" as const, "dare" as const),
        (requestedCategory) => {
          const players = createPlayers(2);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Submit prompts of both categories
          module.handleEvent(players[0].id, "submitPrompt", {
            text: "A truth prompt",
            category: "truth",
          });
          module.handleEvent(players[0].id, "submitPrompt", {
            text: "A dare prompt",
            category: "dare",
          });
          module.handleEvent(players[1].id, "submitPrompt", {
            text: "Another truth",
            category: "truth",
          });
          module.handleEvent(players[1].id, "submitPrompt", {
            text: "Another dare",
            category: "dare",
          });

          // Both players ready up → transition to play
          module.handleEvent(players[0].id, "playerReady", {});
          module.handleEvent(players[1].id, "playerReady", {});

          // Host spins wheel
          module.handleEvent(players[0].id, "spinWheel", {});

          // Get selected player from state
          const state = module.getState(players[0].id) as Record<string, unknown>;
          const selectedPlayerId = state.currentSelectedPlayer as string;

          // Clear mocks before choice
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          // Selected player chooses category
          module.handleEvent(selectedPlayerId, "choiceSelected", {
            category: requestedCategory,
          });

          // Should emit promptRevealed with matching category
          const revealCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === "promptRevealed"
          );
          expect(revealCalls.length).toBe(1);

          const revealPayload = revealCalls[0][1] as {
            prompt: { category: string } | null;
            category?: string;
          };
          expect(revealPayload.prompt).not.toBeNull();
          expect(revealPayload.prompt!.category).toBe(requestedCategory);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 14: Prompt category matching (fallback)
  // Validates: Requirements 6.5, 6.6
  it("Property 14: choosing a category falls back to other category when requested is empty", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("truth" as const, "dare" as const),
        (requestedCategory) => {
          const players = createPlayers(2);
          const context = createMockContext(players);
          const module = new TruthOrDareModule();
          module.start(context);

          // Only submit prompts of the OTHER category
          const otherCategory = requestedCategory === "truth" ? "dare" : "truth";
          module.handleEvent(players[0].id, "submitPrompt", {
            text: "Only other category",
            category: otherCategory,
          });
          module.handleEvent(players[1].id, "submitPrompt", {
            text: "Another other category",
            category: otherCategory,
          });

          // Both ready → play
          module.handleEvent(players[0].id, "playerReady", {});
          module.handleEvent(players[1].id, "playerReady", {});

          // Host spins wheel
          module.handleEvent(players[0].id, "spinWheel", {});

          // Get selected player
          const state = module.getState(players[0].id) as Record<string, unknown>;
          const selectedPlayerId = state.currentSelectedPlayer as string;

          // Clear mocks
          (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

          // Selected player requests a category that has no prompts
          module.handleEvent(selectedPlayerId, "choiceSelected", {
            category: requestedCategory,
          });

          // Should emit promptRevealed with null prompt and a message
          const revealCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === "promptRevealed"
          );
          expect(revealCalls.length).toBe(1);

          const revealPayload = revealCalls[0][1] as {
            prompt: null;
            message: string;
          };
          expect(revealPayload.prompt).toBeNull();
          expect(revealPayload.message).toContain("remaining");
        }
      ),
      { numRuns: 100 }
    );
  });
});
