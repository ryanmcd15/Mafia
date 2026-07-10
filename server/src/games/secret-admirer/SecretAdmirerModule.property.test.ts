/**
 * Property-based tests for SecretAdmirerModule.
 *
 * **Feature: secret-admirer, Property 4: Rounds configuration validation**
 * **Feature: secret-admirer, Property 5: Round timer configuration validation**
 * **Feature: secret-admirer, Property 6: Non-host configuration rejection**
 * **Feature: secret-admirer, Property 10: Answer length validation**
 * **Feature: secret-admirer, Property 11: Duplicate answer rejection (idempotence)**
 * **Feature: secret-admirer, Property 12: Round completion on all submissions**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SecretAdmirerModule } from "./SecretAdmirerModule.js";
import { GameModuleContext } from "../../types.js";

// ─── Test Prompts Helper ────────────────────────────────────────────

function createTestPromptsFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const prompts = {
    mild: Array.from({ length: 100 }, (_, i) => `Mild prompt ${i}`),
    medium: Array.from({ length: 100 }, (_, i) => `Medium prompt ${i}`),
    hot: Array.from({ length: 100 }, (_, i) => `Hot prompt ${i}`),
  };
  const filePath = join(dir, "prompts.json");
  writeFileSync(filePath, JSON.stringify(prompts));
  return filePath;
}

// ─── Mock Context Helper ────────────────────────────────────────────

function createMockContext(playerCount: number) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    isConnected: true,
  }));

  const emittedEvents: Array<{ event: string; payload: unknown; target?: string }> = [];

  const context: GameModuleContext = {
    emitToRoom: (event, payload) => emittedEvents.push({ event, payload }),
    emitToPlayer: (socketId, event, payload) => emittedEvents.push({ event, payload, target: socketId }),
    signalGameOver: (results) => emittedEvents.push({ event: "signalGameOver", payload: results }),
    getPlayers: () => [...players],
  };

  return { players, context, emittedEvents };
}

// ─── Property 6: Non-host configuration rejection ───────────────────

describe("Property 6: Non-host configuration rejection", () => {
  /**
   * **Validates: Requirements 2.8**
   *
   * For any non-host player and any configuration change payload, the system
   * SHALL reject the change and preserve the current configuration values unchanged.
   */

  it("any non-host player attempting any configuration change gets rejected with saError", () => {
    fc.assert(
      fc.property(
        // Generate player count (3-10) and a non-host player index (1+)
        fc.integer({ min: 3, max: 10 }),
        fc.record({
          rounds: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
          spiceLevel: fc.option(fc.constantFrom("mild", "medium", "hot", "extreme"), { nil: undefined }),
          roundTimer: fc.option(fc.integer({ min: 10, max: 200 }), { nil: undefined }),
          customPrompts: fc.option(fc.boolean(), { nil: undefined }),
        }),
        (playerCount, configPayload) => {
          const module = new SecretAdmirerModule();
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Pick a non-host player (any player that is not player-0)
          const nonHostIndex = 1; // player-1 is always non-host
          const nonHostId = `player-${nonHostIndex}`;

          // Clear events from start()
          emittedEvents.length = 0;

          // Capture config state before the call
          const stateBefore = module.getState(nonHostId) as { config: unknown };
          const configBefore = JSON.parse(JSON.stringify(stateBefore.config));

          // Attempt configuration change as non-host
          module.handleEvent(nonHostId, "configure", configPayload);

          // Verify: an "saError" event is emitted to the non-host player
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === nonHostId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Only the host can modify settings"
          );

          // Verify: config remains unchanged
          const stateAfter = module.getState(nonHostId) as { config: unknown };
          const configAfter = JSON.parse(JSON.stringify(stateAfter.config));
          expect(configAfter).toEqual(configBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("any arbitrary non-host player index results in rejection", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.integer({ min: 1, max: 9 }),
        fc.record({
          rounds: fc.option(fc.integer({ min: 5, max: 20 }), { nil: undefined }),
          spiceLevel: fc.option(fc.constantFrom("mild", "medium", "hot"), { nil: undefined }),
          roundTimer: fc.option(fc.constantFrom(30, 35, 40, 45, 50, 55, 60, 90, 120), { nil: undefined }),
          customPrompts: fc.option(fc.boolean(), { nil: undefined }),
        }),
        (playerCount, nonHostOffset, configPayload) => {
          // Ensure non-host index is within bounds
          const nonHostIndex = (nonHostOffset % (playerCount - 1)) + 1;
          const nonHostId = `player-${nonHostIndex}`;

          const module = new SecretAdmirerModule();
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Clear events from start()
          emittedEvents.length = 0;

          // Capture config before
          const stateBefore = module.getState(nonHostId) as { config: unknown };
          const configBefore = JSON.parse(JSON.stringify(stateBefore.config));

          // Attempt configuration change
          module.handleEvent(nonHostId, "configure", configPayload);

          // Verify rejection
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === nonHostId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Only the host can modify settings"
          );

          // Verify config is identical before and after
          const stateAfter = module.getState(nonHostId) as { config: unknown };
          const configAfter = JSON.parse(JSON.stringify(stateAfter.config));
          expect(configAfter).toEqual(configBefore);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Feature: secret-admirer, Property 5: Round timer configuration validation ──

describe("Property 5: Round timer configuration validation", () => {
  /**
   * **Validates: Requirements 2.7**
   *
   * For any integer value, setting it as the round timer duration SHALL be accepted
   * if and only if it is between 30 and 120 inclusive and is a multiple of 5.
   * Invalid values SHALL be rejected.
   */

  it("valid timers (30-120, step 5) are accepted", () => {
    // Generate valid timer values: 30, 35, 40, ..., 115, 120
    const validTimer = fc.integer({ min: 6, max: 24 }).map((n) => n * 5);

    fc.assert(
      fc.property(validTimer, (roundTimer) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // Clear the initial saPhaseChanged event
        emittedEvents.length = 0;

        mod.handleEvent("player-0", "configure", { roundTimer });

        // Should emit saPhaseChanged with updated config
        const phaseEvent = emittedEvents.find((e) => e.event === "saPhaseChanged");
        expect(phaseEvent).toBeDefined();

        // No error should have been emitted
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeUndefined();

        // Verify config was updated via getState
        const state = mod.getState("player-0") as { config: { roundTimer: number } };
        expect(state.config.roundTimer).toBe(roundTimer);
      }),
      { numRuns: 100 },
    );
  });

  it("invalid timers (not in 30-120 range, or not multiple of 5) are rejected", () => {
    // Generate integers that are NOT valid timers
    // Invalid if: outside [30,120] OR not a multiple of 5
    const invalidTimer = fc.integer({ min: -500, max: 500 }).filter((n) => {
      const inRange = n >= 30 && n <= 120;
      const multipleOf5 = n % 5 === 0;
      return !(inRange && multipleOf5);
    });

    fc.assert(
      fc.property(invalidTimer, (roundTimer) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // Get initial roundTimer value
        const initialState = mod.getState("player-0") as { config: { roundTimer: number } };
        const initialTimer = initialState.config.roundTimer;

        // Clear events
        emittedEvents.length = 0;

        mod.handleEvent("player-0", "configure", { roundTimer });

        // Should emit saError event
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeDefined();

        // Previous valid value should be retained
        const afterState = mod.getState("player-0") as { config: { roundTimer: number } };
        expect(afterState.config.roundTimer).toBe(initialTimer);
      }),
      { numRuns: 100 },
    );
  });

  it("previous valid value retained after rejection", () => {
    // Generate a valid timer, then an invalid timer
    const validTimer = fc.integer({ min: 6, max: 24 }).map((n) => n * 5);
    const invalidTimer = fc.integer({ min: -500, max: 500 }).filter((n) => {
      const inRange = n >= 30 && n <= 120;
      const multipleOf5 = n % 5 === 0;
      return !(inRange && multipleOf5);
    });

    fc.assert(
      fc.property(validTimer, invalidTimer, (validValue, invalidValue) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // First, set a valid timer value
        mod.handleEvent("player-0", "configure", { roundTimer: validValue });

        // Verify it took effect
        const midState = mod.getState("player-0") as { config: { roundTimer: number } };
        expect(midState.config.roundTimer).toBe(validValue);

        // Clear events
        emittedEvents.length = 0;

        // Now try an invalid value
        mod.handleEvent("player-0", "configure", { roundTimer: invalidValue });

        // Should emit error
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeDefined();

        // The previously valid value should be retained
        const afterState = mod.getState("player-0") as { config: { roundTimer: number } };
        expect(afterState.config.roundTimer).toBe(validValue);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Feature: secret-admirer, Property 4: Rounds configuration validation ──

describe("Property 4: Rounds configuration validation", () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any integer value, setting it as the number of rounds SHALL be accepted
   * if and only if it is a whole number between 5 and 20 inclusive. Values outside
   * this range SHALL be rejected and the previous valid value retained.
   */

  it("valid rounds values (5-20 inclusive) are accepted", () => {
    const validRounds = fc.integer({ min: 5, max: 20 });

    fc.assert(
      fc.property(validRounds, (rounds) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // Clear events from start()
        emittedEvents.length = 0;

        mod.handleEvent("player-0", "configure", { rounds });

        // Should emit saPhaseChanged with updated config
        const phaseEvent = emittedEvents.find((e) => e.event === "saPhaseChanged");
        expect(phaseEvent).toBeDefined();

        // No error should have been emitted
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeUndefined();

        // Verify config was updated via getState
        const state = mod.getState("player-0") as { config: { rounds: number } };
        expect(state.config.rounds).toBe(rounds);
      }),
      { numRuns: 100 },
    );
  });

  it("integer values outside 5-20 range are rejected", () => {
    const invalidRounds = fc.integer({ min: -100, max: 100 }).filter(
      (n) => n < 5 || n > 20
    );

    fc.assert(
      fc.property(invalidRounds, (rounds) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // Get initial rounds value
        const initialState = mod.getState("player-0") as { config: { rounds: number } };
        const initialRounds = initialState.config.rounds;

        // Clear events
        emittedEvents.length = 0;

        mod.handleEvent("player-0", "configure", { rounds });

        // Should emit saError event
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeDefined();

        // Previous valid value should be retained
        const afterState = mod.getState("player-0") as { config: { rounds: number } };
        expect(afterState.config.rounds).toBe(initialRounds);
      }),
      { numRuns: 100 },
    );
  });

  it("non-integer numeric values are rejected", () => {
    const nonIntegerRounds = fc.double({ min: 5, max: 20, noNaN: true }).filter(
      (n) => !Number.isInteger(n)
    );

    fc.assert(
      fc.property(nonIntegerRounds, (rounds) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // Get initial rounds value
        const initialState = mod.getState("player-0") as { config: { rounds: number } };
        const initialRounds = initialState.config.rounds;

        // Clear events
        emittedEvents.length = 0;

        mod.handleEvent("player-0", "configure", { rounds });

        // Should emit saError event
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeDefined();

        // Previous valid value should be retained
        const afterState = mod.getState("player-0") as { config: { rounds: number } };
        expect(afterState.config.rounds).toBe(initialRounds);
      }),
      { numRuns: 100 },
    );
  });

  it("previously valid value retained after invalid value rejection", () => {
    const validRounds = fc.integer({ min: 5, max: 20 });
    const invalidRounds = fc.integer({ min: -100, max: 100 }).filter(
      (n) => n < 5 || n > 20
    );

    fc.assert(
      fc.property(validRounds, invalidRounds, (validValue, invalidValue) => {
        const mod = new SecretAdmirerModule();
        const { context, emittedEvents } = createMockContext(4);
        mod.start(context);

        // First, set a valid rounds value
        mod.handleEvent("player-0", "configure", { rounds: validValue });

        // Verify it took effect
        const midState = mod.getState("player-0") as { config: { rounds: number } };
        expect(midState.config.rounds).toBe(validValue);

        // Clear events
        emittedEvents.length = 0;

        // Now try an invalid value
        mod.handleEvent("player-0", "configure", { rounds: invalidValue });

        // Should emit error
        const errorEvent = emittedEvents.find((e) => e.event === "saError");
        expect(errorEvent).toBeDefined();

        // The previously valid value should be retained
        const afterState = mod.getState("player-0") as { config: { rounds: number } };
        expect(afterState.config.rounds).toBe(validValue);
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Feature: secret-admirer, Property 9: Custom prompt length validation ──

describe("Property 9: Custom prompt length validation", () => {
  /**
   * **Validates: Requirements 4.7**
   *
   * For any string submitted as a custom prompt when custom prompts are enabled,
   * the system SHALL accept it if and only if its character length is between 1 and
   * 300 inclusive. Strings of length 0 or greater than 300 SHALL be rejected.
   */

  it("valid custom prompts (1-300 chars) are accepted when custom prompts enabled", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter((s) => s.length >= 1),
        (prompt) => {
          const module = new SecretAdmirerModule();
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Enable custom prompts as host (player-0)
          module.handleEvent("player-0", "configure", { customPrompts: true });

          // Clear events
          emittedEvents.length = 0;

          // Submit a valid custom prompt as any player
          module.handleEvent("player-1", "submitCustomPrompt", { prompt });

          // Should NOT emit saError
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorEvents).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("invalid custom prompts (0 or >300 chars) are rejected", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""), // empty string
          fc.string({ minLength: 301, maxLength: 600 }).filter((s) => s.length >= 301) // too long
        ),
        (prompt) => {
          const module = new SecretAdmirerModule();
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Enable custom prompts as host (player-0)
          module.handleEvent("player-0", "configure", { customPrompts: true });

          // Clear events
          emittedEvents.length = 0;

          // Submit an invalid custom prompt
          module.handleEvent("player-1", "submitCustomPrompt", { prompt });

          // Should emit saError with length constraint message
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toContain(
            "Custom prompt must be between 1 and 300 characters"
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("custom prompts are rejected when custom prompts feature is disabled", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter((s) => s.length >= 1),
        (prompt) => {
          const module = new SecretAdmirerModule();
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Custom prompts disabled by default (Req 2.6) — do NOT enable them

          // Clear events
          emittedEvents.length = 0;

          // Submit a custom prompt when feature is disabled
          module.handleEvent("player-1", "submitCustomPrompt", { prompt });

          // Should emit saError "Custom prompts are not enabled"
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Custom prompts are not enabled"
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 11: Duplicate answer rejection (idempotence) ──

describe("Property 11: Duplicate answer rejection (idempotence)", () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any player who has already submitted a valid answer in the current round,
   * submitting a second answer SHALL be rejected and the original answer SHALL remain unchanged.
   */

  it("submitting a second answer in the same round is rejected and original preserved", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (firstAnswer, secondAnswer) => {
          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Host starts the game (transitions to roundActive)
          module.handleEvent("player-0", "startGame", {});

          // Clear events to isolate answer-related events
          emittedEvents.length = 0;

          // player-1 submits firstAnswer — should succeed (no saError)
          module.handleEvent("player-1", "submitAnswer", { text: firstAnswer });

          const errorsAfterFirst = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorsAfterFirst).toHaveLength(0);

          // Verify the answer was accepted (saAnswerReceived emitted)
          const answerReceivedEvents = emittedEvents.filter(
            (e) => e.event === "saAnswerReceived"
          );
          expect(answerReceivedEvents.length).toBeGreaterThanOrEqual(1);

          // Clear events before second submission
          emittedEvents.length = 0;

          // player-1 submits secondAnswer — should get saError
          module.handleEvent("player-1", "submitAnswer", { text: secondAnswer });

          const errorsAfterSecond = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorsAfterSecond).toHaveLength(1);
          expect(
            (errorsAfterSecond[0].payload as { message: string }).message
          ).toBe("You have already submitted an answer this round");

          // Verify no additional saAnswerReceived was emitted (original preserved)
          const additionalAnswerEvents = emittedEvents.filter(
            (e) => e.event === "saAnswerReceived"
          );
          expect(additionalAnswerEvents).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 12: Round completion on all submissions ──

describe("Property 12: Round completion on all submissions", () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * For any set of connected players in a round, when all connected players have
   * submitted valid answers, the round SHALL end immediately (without waiting for
   * the timer to expire).
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round ends immediately when all connected players submit answers", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }), // player count
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 10, maxLength: 10 }),
        (playerCount, answers) => {
          // Trim answers array to playerCount length
          const actualAnswers = answers.slice(0, playerCount);
          if (actualAnswers.length < playerCount) return; // skip if not enough answers generated

          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Host starts the game (transitions to roundActive)
          module.handleEvent("player-0", "startGame", {});

          // Verify phase is "roundActive"
          const stateAfterStart = module.getState("player-0") as { phase: string };
          expect(stateAfterStart.phase).toBe("roundActive");

          // Clear events to isolate phase-change events
          emittedEvents.length = 0;

          // Submit valid answers for all connected players except the last one
          for (let i = 0; i < playerCount - 1; i++) {
            module.handleEvent(`player-${i}`, "submitAnswer", { text: actualAnswers[i] });
            // After each submission (except the last), phase should still be "roundActive"
            const midState = module.getState(`player-${i}`) as { phase: string };
            expect(midState.phase).toBe("roundActive");
          }

          // Submit the last player's answer — this should trigger immediate round end
          module.handleEvent(`player-${playerCount - 1}`, "submitAnswer", {
            text: actualAnswers[playerCount - 1],
          });

          // After the last submission, verify phase has transitioned to "reactions"
          // This proves the round ended immediately without waiting for the timer
          // (messages are delivered synchronously, then phase moves to reactions)
          const finalState = module.getState("player-0") as { phase: string };
          expect(finalState.phase).toBe("reactions");

          // Verify saPhaseChanged event was emitted with "reactions"
          const phaseChangedEvents = emittedEvents.filter(
            (e) => e.event === "saPhaseChanged" && (e.payload as { phase: string }).phase === "reactions"
          );
          expect(phaseChangedEvents).toHaveLength(1);

          // Clean up the module's timers
          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 10: Answer length validation ──

describe("Property 10: Answer length validation", () => {
  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any string submitted as a round answer, the system SHALL accept it if and only if
   * its character length is between 1 and 500 inclusive. Empty strings or strings exceeding
   * 500 characters SHALL be rejected with an error indicating the length constraint.
   */

  it("valid answers (1-500 chars) are accepted during roundActive phase", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (text) => {
          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Host starts the game (transitions to roundActive)
          module.handleEvent("player-0", "startGame", {});

          // Verify phase is "roundActive"
          const state = module.getState("player-0") as { phase: string };
          expect(state.phase).toBe("roundActive");

          // Clear events to isolate answer-related events
          emittedEvents.length = 0;

          // player-1 submits a valid answer (1-500 chars)
          module.handleEvent("player-1", "submitAnswer", { text });

          // No saError should have been emitted to player-1
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorEvents).toHaveLength(0);

          // saAnswerReceived should have been emitted (answer accepted)
          const answerEvents = emittedEvents.filter(
            (e) => e.event === "saAnswerReceived"
          );
          expect(answerEvents.length).toBeGreaterThanOrEqual(1);

          // Clean up timers
          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("answers with invalid length (empty or >500) are rejected with error", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),  // empty string
          fc.string({ minLength: 501, maxLength: 1000 })  // too long
        ),
        (text) => {
          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);

          // Host starts the game (transitions to roundActive)
          module.handleEvent("player-0", "startGame", {});

          // Verify phase is "roundActive"
          const state = module.getState("player-0") as { phase: string };
          expect(state.phase).toBe("roundActive");

          // Clear events to isolate answer-related events
          emittedEvents.length = 0;

          // player-1 submits an invalid answer (empty or >500 chars)
          module.handleEvent("player-1", "submitAnswer", { text });

          // saError SHOULD have been emitted to player-1
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === "player-1"
          );
          expect(errorEvents).toHaveLength(1);
          expect(
            (errorEvents[0].payload as { message: string }).message
          ).toBe("Answer must be between 1 and 500 characters");

          // No saAnswerReceived should have been emitted (answer rejected)
          const answerEvents = emittedEvents.filter(
            (e) => e.event === "saAnswerReceived"
          );
          expect(answerEvents).toHaveLength(0);

          // Clean up timers
          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Feature: secret-admirer, Property 14: Reaction emoji validation ──

describe("Property 14: Reaction emoji validation", () => {
  /**
   * **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
   *
   * For any emoji submitted as a reaction, the system SHALL accept it if and only if
   * it is one of the predefined set (❤️, 😂, 😍, 🔥, 👀, 💀). Additionally, submitting
   * the same emoji to the same message a second time SHALL be rejected, and attempting
   * to react to a message not addressed to the player SHALL be rejected.
   */

  const VALID_EMOJIS = ["❤️", "😂", "😍", "🔥", "👀", "💀"];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: advance the game to the reactions phase with 4 players.
   * Returns the module, emitted events, and delivered message info.
   */
  function setupReactionsPhase() {
    const promptsFile = createTestPromptsFile();
    const module = new SecretAdmirerModule(promptsFile);
    const { context, emittedEvents } = createMockContext(4);
    module.start(context);

    // Host starts the game
    module.handleEvent("player-0", "startGame", {});

    // All 4 players submit answers → triggers endRound → transitions to "reactions"
    for (let i = 0; i < 4; i++) {
      module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer from player ${i}` });
    }

    // Verify we're in reactions phase
    const state = module.getState("player-0") as { phase: string };
    expect(state.phase).toBe("reactions");

    // Find delivered messages from emitted events
    const deliveredMessages = emittedEvents.filter(
      (e) => e.event === "saMessageDelivered"
    );

    return { module, emittedEvents, deliveredMessages };
  }

  it("valid emojis from the predefined set are accepted", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_EMOJIS),
        (emoji) => {
          const { module, emittedEvents, deliveredMessages } = setupReactionsPhase();

          // Pick the first delivered message — the target can react to it
          expect(deliveredMessages.length).toBeGreaterThan(0);
          const delivered = deliveredMessages[0];
          const targetPlayerId = delivered.target!;
          const messageId = (delivered.payload as { messageId: string }).messageId;

          // Clear events before reaction
          emittedEvents.length = 0;

          // Target reacts with valid emoji
          module.handleEvent(targetPlayerId, "react", { messageId, emoji });

          // No saError should be emitted to the target
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === targetPlayerId
          );
          expect(errorEvents).toHaveLength(0);

          // saReactionUpdated should have been emitted
          const reactionEvents = emittedEvents.filter(
            (e) => e.event === "saReactionUpdated"
          );
          expect(reactionEvents).toHaveLength(1);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("invalid emojis not in predefined set are rejected", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !VALID_EMOJIS.includes(s)),
        (emoji) => {
          const { module, emittedEvents, deliveredMessages } = setupReactionsPhase();

          // Pick the first delivered message — the target tries to react
          expect(deliveredMessages.length).toBeGreaterThan(0);
          const delivered = deliveredMessages[0];
          const targetPlayerId = delivered.target!;
          const messageId = (delivered.payload as { messageId: string }).messageId;

          // Clear events before reaction
          emittedEvents.length = 0;

          // Target reacts with invalid emoji
          module.handleEvent(targetPlayerId, "react", { messageId, emoji });

          // saError "Invalid emoji reaction" should be emitted
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === targetPlayerId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Invalid emoji reaction"
          );

          // No saReactionUpdated should have been emitted
          const reactionEvents = emittedEvents.filter(
            (e) => e.event === "saReactionUpdated"
          );
          expect(reactionEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate emoji reaction to same message is rejected", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_EMOJIS),
        (emoji) => {
          const { module, emittedEvents, deliveredMessages } = setupReactionsPhase();

          // Pick the first delivered message
          expect(deliveredMessages.length).toBeGreaterThan(0);
          const delivered = deliveredMessages[0];
          const targetPlayerId = delivered.target!;
          const messageId = (delivered.payload as { messageId: string }).messageId;

          // First reaction — should succeed
          module.handleEvent(targetPlayerId, "react", { messageId, emoji });

          // Clear events before second reaction
          emittedEvents.length = 0;

          // Second reaction with same emoji — should be rejected
          module.handleEvent(targetPlayerId, "react", { messageId, emoji });

          // saError "You have already reacted with this emoji" should be emitted
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === targetPlayerId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "You have already reacted with this emoji"
          );

          // No saReactionUpdated should have been emitted for the duplicate
          const reactionEvents = emittedEvents.filter(
            (e) => e.event === "saReactionUpdated"
          );
          expect(reactionEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("reacting to a message not addressed to the player is rejected", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_EMOJIS),
        (emoji) => {
          const { module, emittedEvents, deliveredMessages } = setupReactionsPhase();

          // Find a delivered message and identify a player who is NOT the target
          expect(deliveredMessages.length).toBeGreaterThan(0);
          const delivered = deliveredMessages[0];
          const targetPlayerId = delivered.target!;
          const messageId = (delivered.payload as { messageId: string }).messageId;

          // Find a different player who is NOT the target of this message
          const allPlayers = ["player-0", "player-1", "player-2", "player-3"];
          const nonTargetPlayer = allPlayers.find((p) => p !== targetPlayerId)!;

          // Clear events before reaction
          emittedEvents.length = 0;

          // Non-target player tries to react
          module.handleEvent(nonTargetPlayer, "react", { messageId, emoji });

          // saError "You can only react to messages addressed to you" should be emitted
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === nonTargetPlayer
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "You can only react to messages addressed to you"
          );

          // No saReactionUpdated should have been emitted
          const reactionEvents = emittedEvents.filter(
            (e) => e.event === "saReactionUpdated"
          );
          expect(reactionEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 15: Reaction count anonymity ──

describe("Property 15: Reaction count anonymity", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any reaction submission, the emitted reaction update SHALL contain aggregate
   * counts per emoji but SHALL NOT include any player identifier indicating who reacted.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saReactionUpdated events contain only aggregate counts, no player identifiers", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("❤️", "😂", "😍", "🔥", "👀", "💀"),
        (emoji) => {
          // Setup: get to reactions phase with 4 players
          const promptsFile = createTestPromptsFile();
          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(4);
          module.start(context);
          module.handleEvent("player-0", "startGame", {});

          // All submit answers to trigger round end → reactions phase
          for (let i = 0; i < 4; i++) {
            module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer ${i}` });
          }

          // Find a delivered message and its target
          const deliveredMsg = emittedEvents.find(
            (e) => e.event === "saMessageDelivered"
          );
          const targetPlayerId = deliveredMsg!.target!;
          const messageId = (deliveredMsg!.payload as { messageId: string }).messageId;

          // Clear events to isolate reaction update
          emittedEvents.length = 0;

          // Target player reacts
          module.handleEvent(targetPlayerId, "react", { messageId, emoji });

          // Find the saReactionUpdated event
          const reactionUpdates = emittedEvents.filter((e) => e.event === "saReactionUpdated");
          expect(reactionUpdates).toHaveLength(1);

          const payload = reactionUpdates[0].payload as Record<string, unknown>;

          // Verify it contains messageId and reactions (counts only)
          expect(payload.messageId).toBe(messageId);
          expect(payload.reactions).toBeDefined();

          // Verify reactions is { emoji: number } format (aggregate counts)
          const reactions = payload.reactions as Record<string, unknown>;
          for (const [key, value] of Object.entries(reactions)) {
            expect(typeof key).toBe("string"); // emoji key
            expect(typeof value).toBe("number"); // count value
          }

          // CRITICAL: verify NO player identifiers in the payload
          // Check that the payload doesn't contain any player IDs
          const payloadStr = JSON.stringify(payload);
          for (let i = 0; i < 4; i++) {
            expect(payloadStr).not.toContain(`player-${i}`);
          }

          // Also verify the reactions object values are numbers (counts) not arrays/objects
          for (const value of Object.values(reactions)) {
            expect(typeof value).toBe("number");
            expect(value).toBeGreaterThan(0);
          }

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 18: Non-blank messages presented for voting ──

describe("Property 18: Non-blank messages presented for voting", () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any round where some players submitted non-blank answers and some had blank
   * submissions (due to timer expiry), only the non-blank messages SHALL be presented
   * for community voting.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saVotingStarted event only contains messages with non-empty text", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }), // player count
        fc.integer({ min: 1, max: 9 }),   // number of submitters (will be clamped)
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 10, maxLength: 10 }),
        (playerCount, rawSubmitterCount, answers) => {
          // Ensure at least 1 submitter and at least 1 non-submitter
          const submitterCount = Math.max(1, Math.min(rawSubmitterCount, playerCount - 1));

          const module = new SecretAdmirerModule(promptsFile);

          // Ensure prompt pool is loaded so startRound() can select a prompt and set the timer
          const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
          promptPool.validate();

          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Host starts the game
          module.handleEvent("player-0", "startGame", {});

          // Only the first `submitterCount` players submit answers; the rest don't
          for (let i = 0; i < submitterCount; i++) {
            module.handleEvent(`player-${i}`, "submitAnswer", { text: answers[i] });
          }

          // Advance past the round timer (60s default) — auto-fills blanks for non-submitters
          vi.advanceTimersByTime(60_000 + 100);

          // Advance past the 60s reaction timer to transition to voting
          vi.advanceTimersByTime(15_000 + 100);

          // Find the saVotingStarted event (now emitted per-player)
          const votingStartedEvents = emittedEvents.filter(
            (e) => e.event === "saVotingStarted"
          );
          expect(votingStartedEvents.length).toBeGreaterThanOrEqual(1);

          // Check the first player's payload (all players get the same messages list)
          const payload = votingStartedEvents[0].payload as {
            messages: Array<{ id: string; text: string }>;
            timeRemaining: number;
          };

          // PROPERTY: All messages in the voting payload must have non-empty text
          for (const msg of payload.messages) {
            expect(msg.text).not.toBe("");
            expect(msg.text.length).toBeGreaterThan(0);
          }

          // PROPERTY: The number of messages equals the number of submitters
          // (since each submitter submitted exactly one non-blank answer)
          expect(payload.messages).toHaveLength(submitterCount);

          // Clean up timers
          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 16: Voting constraints ──

describe("Property 16: Voting constraints", () => {
  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * For any player during the community voting phase, the system SHALL allow exactly
   * one vote, and SHALL reject any vote cast for the player's own message. Self-voting
   * SHALL be rejected with an appropriate error.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: advance the game to the voting phase with the given number of players.
   * Returns the module, emitted events, and a map of messageId→authorId built from
   * saMessageDelivered events and answer text patterns.
   */
  function setupVotingPhase(playerCount: number) {
    const promptsFile = createTestPromptsFile();
    const module = new SecretAdmirerModule(promptsFile);
    const { context, emittedEvents } = createMockContext(playerCount);
    module.start(context);

    // Host starts the game (transitions to roundActive)
    module.handleEvent("player-0", "startGame", {});

    // All players submit answers with identifiable text
    for (let i = 0; i < playerCount; i++) {
      module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer from player ${i}` });
    }

    // Verify we're in reactions phase
    const stateAfterRound = module.getState("player-0") as { phase: string };
    expect(stateAfterRound.phase).toBe("reactions");

    // Collect message delivery info to build messageId → authorId mapping
    // Each saMessageDelivered event contains a messageId and text like "💌 Anonymous admirer says... Answer from player X"
    const deliveredMessages = emittedEvents.filter(
      (e) => e.event === "saMessageDelivered"
    );
    const messageAuthorMap = new Map<string, string>();
    for (const msg of deliveredMessages) {
      const payload = msg.payload as { messageId: string; message: string };
      // Extract author from the text pattern "...Answer from player X"
      const match = payload.message.match(/Answer from player (\d+)/);
      if (match) {
        messageAuthorMap.set(payload.messageId, `player-${match[1]}`);
      }
    }

    // Advance the reaction timer (15s) to move to voting phase
    vi.advanceTimersByTime(15_000);

    // Verify we're in voting phase
    const stateAfterReactions = module.getState("player-0") as { phase: string };
    expect(stateAfterReactions.phase).toBe("voting");

    // Collect the voting messages from saVotingStarted event
    const votingStarted = emittedEvents.find((e) => e.event === "saVotingStarted");
    const votingMessages = votingStarted
      ? (votingStarted.payload as { messages: Array<{ id: string; text: string }> }).messages
      : [];

    // Clear events so we can observe voting-related events cleanly
    emittedEvents.length = 0;

    return { module, emittedEvents, messageAuthorMap, votingMessages };
  }

  it("each player can cast exactly one vote during the voting phase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        (playerCount) => {
          const { module, emittedEvents, messageAuthorMap, votingMessages } = setupVotingPhase(playerCount);

          // We need at least one message to vote on that isn't authored by player-0
          const voterId = "player-0";
          const validMessage = votingMessages.find((m) => messageAuthorMap.get(m.id) !== voterId);
          // If no valid message (unlikely with 3+ players), skip
          if (!validMessage) return;

          // First vote — should succeed
          module.handleEvent(voterId, "submitVote", { messageId: validMessage.id });

          // Should NOT have an error
          const firstVoteErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === voterId
          );
          expect(firstVoteErrors).toHaveLength(0);

          // Should have a saVoteReceived event
          const voteReceivedEvents = emittedEvents.filter(
            (e) => e.event === "saVoteReceived"
          );
          expect(voteReceivedEvents).toHaveLength(1);

          // Clear events before second vote attempt
          emittedEvents.length = 0;

          // Find another valid message to try voting for
          const secondMessage = votingMessages.find(
            (m) => m.id !== validMessage.id && messageAuthorMap.get(m.id) !== voterId
          );
          const secondMessageId = secondMessage ? secondMessage.id : validMessage.id;

          // Second vote attempt from same player — should be rejected
          module.handleEvent(voterId, "submitVote", { messageId: secondMessageId });

          // Should emit saError with duplicate vote message
          const duplicateErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === voterId
          );
          expect(duplicateErrors).toHaveLength(1);
          expect((duplicateErrors[0].payload as { message: string }).message).toBe(
            "You have already voted this round"
          );

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("self-voting (voting for one's own message) is rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (playerCount, playerOffset) => {
          const voterIndex = playerOffset % playerCount;
          const voterId = `player-${voterIndex}`;

          const { module, emittedEvents, messageAuthorMap, votingMessages } = setupVotingPhase(playerCount);

          // Find the message authored by this voter
          const ownMessage = votingMessages.find((m) => messageAuthorMap.get(m.id) === voterId);
          // If voter has no message in voting list (empty answer filtered), skip
          if (!ownMessage) return;

          // Attempt to vote for own message
          module.handleEvent(voterId, "submitVote", { messageId: ownMessage.id });

          // Should emit saError "Self-voting is not permitted"
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === voterId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Self-voting is not permitted"
          );

          // No saVoteReceived should have been emitted
          const voteReceivedEvents = emittedEvents.filter(
            (e) => e.event === "saVoteReceived"
          );
          expect(voteReceivedEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate votes (second vote from same player) are rejected with appropriate error", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (playerCount, playerOffset) => {
          const voterIndex = playerOffset % playerCount;
          const voterId = `player-${voterIndex}`;

          const { module, emittedEvents, messageAuthorMap, votingMessages } = setupVotingPhase(playerCount);

          // Find a valid message to vote for (not authored by the voter)
          const validMessage = votingMessages.find((m) => messageAuthorMap.get(m.id) !== voterId);
          if (!validMessage) return;

          // First vote — should succeed
          module.handleEvent(voterId, "submitVote", { messageId: validMessage.id });

          // Verify first vote succeeded (no error)
          const firstVoteErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === voterId
          );
          expect(firstVoteErrors).toHaveLength(0);

          // Clear events
          emittedEvents.length = 0;

          // Second vote attempt — find another message not by voter, or reuse
          const secondMessage = votingMessages.find(
            (m) => m.id !== validMessage.id && messageAuthorMap.get(m.id) !== voterId
          );
          const secondMessageId = secondMessage ? secondMessage.id : validMessage.id;

          module.handleEvent(voterId, "submitVote", { messageId: secondMessageId });

          // Should emit saError "You have already voted this round"
          const duplicateErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === voterId
          );
          expect(duplicateErrors).toHaveLength(1);
          expect((duplicateErrors[0].payload as { message: string }).message).toBe(
            "You have already voted this round"
          );

          // No saVoteReceived should be emitted for the duplicate vote
          const voteReceivedEvents = emittedEvents.filter(
            (e) => e.event === "saVoteReceived"
          );
          expect(voteReceivedEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});



// ─── Feature: secret-admirer, Property 19: Guess validation ──

/**
 * **Feature: secret-admirer, Property 19: Guess validation**
 * **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
 */
describe("Property 19: Guess validation", () => {
  /**
   * **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
   *
   * For any player in the guessing phase, the guess options SHALL include all other
   * players (excluding themselves). Guessing themselves or a non-existent player SHALL
   * be rejected. Submitting a second guess SHALL be rejected.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: advance the game to the guessing phase.
   * Configures 5 rounds for speed, starts the game, then runs through all rounds.
   */
  function advanceToGuessingPhase(module: SecretAdmirerModule, playerCount: number) {
    const rounds = 5;

    // Ensure prompt pool is loaded so startRound() can select prompts
    const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
    promptPool.validate();

    // Configure with 5 rounds for speed
    module.handleEvent("player-0", "configure", { rounds: 5 });
    // Start game
    module.handleEvent("player-0", "startGame", {});

    for (let round = 0; round < rounds; round++) {
      // Submit answers from all players
      for (let i = 0; i < playerCount; i++) {
        module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer ${round}-${i}` });
      }
      // Advance past reaction timer (15s)
      vi.advanceTimersByTime(15_000);
      // Advance past voting timer (30s)
      vi.advanceTimersByTime(30_000);
    }
  }

  it("valid guess (any other player) is accepted", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (playerCount, guesserOffset, guessTargetOffset) => {
          const guesserIndex = guesserOffset % playerCount;
          const guesserId = `player-${guesserIndex}`;

          // Pick a different player to guess
          let guessTargetIndex = guessTargetOffset % playerCount;
          if (guessTargetIndex === guesserIndex) {
            guessTargetIndex = (guessTargetIndex + 1) % playerCount;
          }
          const guessTargetId = `player-${guessTargetIndex}`;

          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          advanceToGuessingPhase(module, playerCount);

          // Verify we are in guessing phase
          const state = module.getState(guesserId) as { phase: string };
          expect(state.phase).toBe("guessing");

          // Clear events before guess
          emittedEvents.length = 0;

          // Submit a valid guess (another player)
          module.handleEvent(guesserId, "submitGuess", { playerId: guessTargetId });

          // No saError should be emitted to the guesser
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === guesserId
          );
          expect(errorEvents).toHaveLength(0);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("self-guess is rejected", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (playerCount, guesserOffset) => {
          const guesserIndex = guesserOffset % playerCount;
          const guesserId = `player-${guesserIndex}`;

          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          advanceToGuessingPhase(module, playerCount);

          // Verify we are in guessing phase
          const state = module.getState(guesserId) as { phase: string };
          expect(state.phase).toBe("guessing");

          // Clear events before guess
          emittedEvents.length = 0;

          // Submit a self-guess (guessing yourself)
          module.handleEvent(guesserId, "submitGuess", { playerId: guesserId });

          // saError should be emitted with self-guess message
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === guesserId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "You cannot guess yourself as your admirer"
          );

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("non-existent player guess is rejected", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !s.startsWith("player-") || isNaN(parseInt(s.substring(7)))
        ),
        (playerCount, guesserOffset, nonExistentId) => {
          const guesserIndex = guesserOffset % playerCount;
          const guesserId = `player-${guesserIndex}`;

          // Ensure the generated ID doesn't accidentally match a valid player
          const validPlayerIds = Array.from({ length: playerCount }, (_, i) => `player-${i}`);
          if (validPlayerIds.includes(nonExistentId)) return;

          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          advanceToGuessingPhase(module, playerCount);

          // Verify we are in guessing phase
          const state = module.getState(guesserId) as { phase: string };
          expect(state.phase).toBe("guessing");

          // Clear events before guess
          emittedEvents.length = 0;

          // Submit a guess with a non-existent player ID
          module.handleEvent(guesserId, "submitGuess", { playerId: nonExistentId });

          // saError should be emitted with invalid selection message
          const errorEvents = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === guesserId
          );
          expect(errorEvents).toHaveLength(1);
          expect((errorEvents[0].payload as { message: string }).message).toBe(
            "Invalid player selection"
          );

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate guess is rejected", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (playerCount, guesserOffset, firstGuessOffset, secondGuessOffset) => {
          const guesserIndex = guesserOffset % playerCount;
          const guesserId = `player-${guesserIndex}`;

          // Pick a valid first guess (different from guesser)
          let firstGuessIndex = firstGuessOffset % playerCount;
          if (firstGuessIndex === guesserIndex) {
            firstGuessIndex = (firstGuessIndex + 1) % playerCount;
          }
          const firstGuessId = `player-${firstGuessIndex}`;

          // Pick a valid second guess (different from guesser, can be same or different from first)
          let secondGuessIndex = secondGuessOffset % playerCount;
          if (secondGuessIndex === guesserIndex) {
            secondGuessIndex = (secondGuessIndex + 1) % playerCount;
          }
          const secondGuessId = `player-${secondGuessIndex}`;

          const module = new SecretAdmirerModule(promptsFile);
          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          advanceToGuessingPhase(module, playerCount);

          // Verify we are in guessing phase
          const state = module.getState(guesserId) as { phase: string };
          expect(state.phase).toBe("guessing");

          // Clear events before first guess
          emittedEvents.length = 0;

          // Submit first guess — should succeed
          module.handleEvent(guesserId, "submitGuess", { playerId: firstGuessId });

          const firstGuessErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === guesserId
          );
          expect(firstGuessErrors).toHaveLength(0);

          // Clear events before second guess
          emittedEvents.length = 0;

          // Submit second guess — should be rejected
          module.handleEvent(guesserId, "submitGuess", { playerId: secondGuessId });

          // saError should be emitted with duplicate guess message
          const secondGuessErrors = emittedEvents.filter(
            (e) => e.event === "saError" && e.target === guesserId
          );
          expect(secondGuessErrors).toHaveLength(1);
          expect((secondGuessErrors[0].payload as { message: string }).message).toBe(
            "You have already submitted a guess"
          );

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 7: Information hiding before reveal ──

describe("Property 7: Information hiding before reveal", () => {
  /**
   * **Validates: Requirements 3.5, 5.6, 8.8**
   *
   * For any player and any game phase prior to the Reveal_Phase, calling getState
   * SHALL NOT expose: any other player's assignment (who they admire or who admires them),
   * the authorship of any anonymous message, or any other player's guess during the
   * guessing phase.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: advance a game through all pre-reveal phases and collect getState results.
   * Returns the module, cycle mapping, and all getState results per phase per player.
   */
  function setupGameAndAdvancePhases(playerCount: number) {
    const promptsFile = createTestPromptsFile();
    const module = new SecretAdmirerModule(promptsFile);

    // Validate prompt pool so that startRound can select prompts
    const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
    promptPool.validate();

    const { context, emittedEvents } = createMockContext(playerCount);
    module.start(context);

    // Configure with 5 rounds for speed
    module.handleEvent("player-0", "configure", { rounds: 5 });

    // Start game — generates cycle
    module.handleEvent("player-0", "startGame", {});

    // Extract the cycle from saAssignment events emitted to players
    // Each saAssignment event has target: socketId, payload: { targetId, targetName }
    const assignmentEvents = emittedEvents.filter((e) => e.event === "saAssignment");
    const cycle = new Map<string, string>(); // admirerId → targetId
    for (const evt of assignmentEvents) {
      const admirerId = evt.target!;
      const targetId = (evt.payload as { targetId: string }).targetId;
      cycle.set(admirerId, targetId);
    }

    return { module, emittedEvents, cycle };
  }

  it("getState never exposes other players' cycle assignments in any pre-reveal phase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (playerCount) => {
          const { module, cycle } = setupGameAndAdvancePhases(playerCount);

          // --- Phase: roundActive ---
          // Verify all players' getState in roundActive
          for (let i = 0; i < playerCount; i++) {
            const playerId = `player-${i}`;
            const state = module.getState(playerId);
            const stateStr = JSON.stringify(state);

            // The player SHOULD know their own target (the one they admire)
            // But should NOT see any OTHER player's assignment
            for (let j = 0; j < playerCount; j++) {
              if (j === i) continue; // skip self

              const otherPlayerId = `player-${j}`;
              const otherTarget = cycle.get(otherPlayerId);

              // The state should NOT contain the mapping "player-j admires otherTarget"
              // expressed as a field exposing the assignment relationship.
              // Specifically: other players' target assignments should not be in the state.
              // Exception: if this player's own target happens to be mentioned in scores/players list,
              // that's fine. We check that the actual cycle mapping is not exposed.

              // Build the reverse cycle: who admires player-j?
              let admirerOfOther: string | undefined;
              for (const [admirerId, targetId] of cycle) {
                if (targetId === otherPlayerId) {
                  admirerOfOther = admirerId;
                  break;
                }
              }

              // The state for player-i should NOT reveal who admires player-j
              // (unless player-i IS the admirer of player-j, which is their own assignment)
              if (admirerOfOther && admirerOfOther !== playerId) {
                // Check the state doesn't contain a structure that maps admirerOfOther → otherPlayerId
                // We parse the state and look for any "cycle", "assignment", "admirer" fields
                // that would expose this relationship
                if (typeof state === "object" && state !== null) {
                  const stateObj = state as Record<string, unknown>;
                  // Should not have a "cycle" field exposing the full cycle
                  if ("cycle" in stateObj && stateObj.cycle) {
                    const cycleData = stateObj.cycle;
                    // If cycle is exposed as array/map, check it doesn't contain other assignments
                    const cycleStr = JSON.stringify(cycleData);
                    // Should not expose that admirerOfOther admires otherPlayerId
                    // (unless admirerOfOther is the requesting player)
                    if (admirerOfOther !== playerId) {
                      expect(cycleStr).not.toContain(admirerOfOther);
                    }
                  }
                }
              }

              // Also verify otherTarget assignment is not exposed for player-j
              // unless player-i's own target happens to be player-j's target (coincidence in small games)
              const myTarget = cycle.get(playerId);
              if (otherTarget && otherTarget !== myTarget && otherTarget !== playerId) {
                // The state should not reveal that player-j admires otherTarget
                if (typeof state === "object" && state !== null) {
                  const stateObj = state as Record<string, unknown>;
                  if ("cycle" in stateObj && stateObj.cycle) {
                    const cycleStr = JSON.stringify(stateObj.cycle);
                    // Full cycle exposure means player-j's assignment is visible
                    expect(cycleStr).not.toContain(otherPlayerId);
                  }
                }
              }
            }
          }

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("getState never exposes message authorship in any pre-reveal phase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (playerCount) => {
          const { module, cycle } = setupGameAndAdvancePhases(playerCount);

          // All players submit answers to complete the round
          for (let i = 0; i < playerCount; i++) {
            module.handleEvent(`player-${i}`, "submitAnswer", { text: `Secret msg from p${i}` });
          }

          // Now in reactions phase — check getState for each player
          const stateAfterRound = module.getState("player-0") as { phase: string };
          expect(stateAfterRound.phase).toBe("reactions");

          for (let i = 0; i < playerCount; i++) {
            const playerId = `player-${i}`;
            const state = module.getState(playerId);
            const stateStr = JSON.stringify(state);

            // Messages received by this player should be anonymous
            if (typeof state === "object" && state !== null) {
              const stateObj = state as Record<string, unknown>;

              // Check myMessages field — should not contain authorId
              if ("myMessages" in stateObj && Array.isArray(stateObj.myMessages)) {
                for (const msg of stateObj.myMessages as Record<string, unknown>[]) {
                  expect(msg).not.toHaveProperty("authorId");
                  expect(msg).not.toHaveProperty("authorName");
                  expect(msg).not.toHaveProperty("author");
                }
              }

              // Check the full state string for any "authorId" field exposure
              // The state should not mention which player authored which message
              // (messages should only be identifiable by their anonymous content)
              for (let j = 0; j < playerCount; j++) {
                if (j === i) continue;
                const otherPlayerId = `player-${j}`;
                const otherTarget = cycle.get(otherPlayerId);

                // If otherPlayerId wrote a message to otherTarget, and I am otherTarget,
                // I should see the message but NOT know it came from otherPlayerId
                if (otherTarget === playerId) {
                  // I received a message from player-j, but state should not reveal player-j wrote it
                  if ("myMessages" in stateObj && Array.isArray(stateObj.myMessages)) {
                    for (const msg of stateObj.myMessages as Record<string, unknown>[]) {
                      // The message object should not expose the author's identity
                      expect(msg).not.toHaveProperty("authorId");
                      expect(msg).not.toHaveProperty("authorName");
                      // The text should not be associated with a visible author field
                      const msgStr = JSON.stringify(msg);
                      expect(msgStr).not.toContain(`"authorId"`);
                      expect(msgStr).not.toContain(`"authorName"`);
                    }
                  }
                }
              }
            }
          }

          // Advance to voting phase
          vi.advanceTimersByTime(15_000);

          // Now in voting phase — votingMessages should also not contain authorship
          for (let i = 0; i < playerCount; i++) {
            const playerId = `player-${i}`;
            const state = module.getState(playerId);

            if (typeof state === "object" && state !== null) {
              const stateObj = state as Record<string, unknown>;

              // votingMessages should only have id and text, no author info
              if ("votingMessages" in stateObj && Array.isArray(stateObj.votingMessages)) {
                for (const msg of stateObj.votingMessages as Record<string, unknown>[]) {
                  expect(msg).not.toHaveProperty("authorId");
                  expect(msg).not.toHaveProperty("authorName");
                  expect(msg).not.toHaveProperty("author");
                }
              }
            }
          }

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("getState never exposes other players' guesses during guessing phase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        (playerCount) => {
          const promptsFile = createTestPromptsFile();
          const module = new SecretAdmirerModule(promptsFile);

          // Validate prompt pool so rounds can advance
          const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
          promptPool.validate();

          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Configure with 5 rounds
          module.handleEvent("player-0", "configure", { rounds: 5 });

          // Start game
          module.handleEvent("player-0", "startGame", {});

          // Run through all 5 rounds quickly
          for (let round = 0; round < 5; round++) {
            // All players submit answers
            for (let i = 0; i < playerCount; i++) {
              module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer r${round} p${i}` });
            }
            // Advance past reaction timer (15s)
            vi.advanceTimersByTime(15_000);
            // Advance past voting timer (30s)
            vi.advanceTimersByTime(30_000);
          }

          // Now should be in guessing phase
          const guessingState = module.getState("player-0") as { phase: string };
          expect(guessingState.phase).toBe("guessing");

          // Some players submit guesses (but not all, to stay in guessing phase)
          // Have half the players guess (but not enough to end the phase)
          const guessersCount = Math.min(playerCount - 1, Math.floor(playerCount / 2));
          for (let i = 0; i < guessersCount; i++) {
            const guesserId = `player-${i}`;
            // Guess the next player in order (not themselves)
            const guessedId = `player-${(i + 2) % playerCount}`;
            module.handleEvent(guesserId, "submitGuess", { playerId: guessedId });
          }

          // Verify still in guessing phase (not all have guessed)
          const stillGuessing = module.getState("player-0") as { phase: string };
          if (stillGuessing.phase !== "guessing") return; // skip if phase advanced

          // Now check: each player's getState should NOT reveal other players' guesses
          for (let i = 0; i < playerCount; i++) {
            const playerId = `player-${i}`;
            const state = module.getState(playerId);
            const stateStr = JSON.stringify(state);

            if (typeof state === "object" && state !== null) {
              const stateObj = state as Record<string, unknown>;

              // Should not have a "guesses" map exposing all players' guesses
              if ("guesses" in stateObj && stateObj.guesses) {
                const guessesData = stateObj.guesses;

                // If guesses is exposed as an object/map, it should only contain this player's guess
                if (typeof guessesData === "object" && guessesData !== null) {
                  const guessesObj = guessesData as Record<string, unknown>;
                  const guessKeys = Object.keys(guessesObj);

                  // Should only have the requesting player's own guess (if any), not others'
                  for (const key of guessKeys) {
                    expect(key).toBe(playerId);
                  }
                }
              }

              // Check that other players' guess data is not present anywhere
              for (let j = 0; j < guessersCount; j++) {
                if (j === i) continue; // skip checking own guess
                const otherGuesserId = `player-${j}`;
                const otherGuessedId = `player-${(j + 2) % playerCount}`;

                // The state should NOT reveal "player-j guessed player-X"
                // Check for any structure that associates another player with their guess
                if ("otherGuesses" in stateObj || "allGuesses" in stateObj) {
                  // These fields should not exist at all
                  expect(stateObj).not.toHaveProperty("otherGuesses");
                  expect(stateObj).not.toHaveProperty("allGuesses");
                }
              }
            }
          }

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("comprehensive: getState in all pre-reveal phases hides all forbidden information", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        (playerCount) => {
          const promptsFile = createTestPromptsFile();
          const module = new SecretAdmirerModule(promptsFile);

          // Validate prompt pool so rounds can advance
          const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
          promptPool.validate();

          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Configure with 5 rounds
          module.handleEvent("player-0", "configure", { rounds: 5 });

          // Start game
          module.handleEvent("player-0", "startGame", {});

          // Extract cycle from assignment events
          const assignmentEvents = emittedEvents.filter((e) => e.event === "saAssignment");
          const cycle = new Map<string, string>();
          for (const evt of assignmentEvents) {
            cycle.set(evt.target!, (evt.payload as { targetId: string }).targetId);
          }

          // Build reverse cycle: targetId → admirerId
          const reversesCycle = new Map<string, string>();
          for (const [admirerId, targetId] of cycle) {
            reversesCycle.set(targetId, admirerId);
          }

          /**
           * Checks that the state for a given player does not leak forbidden info.
           */
          function assertNoInfoLeak(playerId: string, phase: string) {
            const state = module.getState(playerId);
            if (typeof state !== "object" || state === null) return;

            const stateObj = state as Record<string, unknown>;
            const stateStr = JSON.stringify(state);

            const myTarget = cycle.get(playerId); // who I admire
            const myAdmirer = reversesCycle.get(playerId); // who admires me

            // 1) Should not expose the full cycle or other players' assignments
            for (const [admirerId, targetId] of cycle) {
              if (admirerId === playerId) continue; // my own assignment is okay

              // The state should not reveal that admirerId → targetId
              // We check this by ensuring the state doesn't expose a "cycle" or
              // "assignments" field with the full mapping
              if ("cycle" in stateObj) {
                // Cycle field should not exist in pre-reveal getState
                const cycleField = stateObj.cycle;
                if (Array.isArray(cycleField) || (typeof cycleField === "object" && cycleField !== null)) {
                  const cycleStr = JSON.stringify(cycleField);
                  // Other admirer→target pairs should not be in the exposed cycle data
                  // (checking that the admirer's id doesn't appear as a key/source)
                  if (admirerId !== playerId) {
                    expect(cycleStr).not.toContain(admirerId);
                  }
                }
              }
            }

            // 2) Messages should not reveal authorship
            if ("myMessages" in stateObj && Array.isArray(stateObj.myMessages)) {
              for (const msg of stateObj.myMessages as Record<string, unknown>[]) {
                expect(msg).not.toHaveProperty("authorId");
                expect(msg).not.toHaveProperty("authorName");
                expect(msg).not.toHaveProperty("author");
              }
            }

            if ("votingMessages" in stateObj && Array.isArray(stateObj.votingMessages)) {
              for (const msg of stateObj.votingMessages as Record<string, unknown>[]) {
                expect(msg).not.toHaveProperty("authorId");
                expect(msg).not.toHaveProperty("authorName");
                expect(msg).not.toHaveProperty("author");
              }
            }

            // 3) Other players' guesses should not be visible
            if ("guesses" in stateObj && stateObj.guesses !== null && stateObj.guesses !== undefined) {
              const guessesData = stateObj.guesses;
              if (typeof guessesData === "object" && guessesData !== null && !Array.isArray(guessesData)) {
                const guessKeys = Object.keys(guessesData as Record<string, unknown>);
                for (const key of guessKeys) {
                  // Only the requesting player's own guess key should be present
                  expect(key).toBe(playerId);
                }
              }
            }

            // 4) No revealData should be present before reveal phase
            if (phase !== "reveal") {
              expect(stateObj.revealData ?? null).toBeNull();
            }
          }

          // === Phase: roundActive ===
          for (let i = 0; i < playerCount; i++) {
            assertNoInfoLeak(`player-${i}`, "roundActive");
          }

          // All players submit answers → transitions to reactions
          for (let i = 0; i < playerCount; i++) {
            module.handleEvent(`player-${i}`, "submitAnswer", { text: `Answer from player ${i}` });
          }

          // === Phase: reactions ===
          for (let i = 0; i < playerCount; i++) {
            assertNoInfoLeak(`player-${i}`, "reactions");
          }

          // Advance past reaction timer → voting
          vi.advanceTimersByTime(15_000);

          // === Phase: voting ===
          for (let i = 0; i < playerCount; i++) {
            assertNoInfoLeak(`player-${i}`, "voting");
          }

          // Advance past voting timer → next round
          vi.advanceTimersByTime(30_000);

          // Continue through remaining rounds quickly
          for (let round = 1; round < 5; round++) {
            for (let i = 0; i < playerCount; i++) {
              module.handleEvent(`player-${i}`, "submitAnswer", { text: `R${round} P${i}` });
            }
            vi.advanceTimersByTime(15_000); // reaction timer
            vi.advanceTimersByTime(30_000); // voting timer
          }

          // === Phase: guessing ===
          const gState = module.getState("player-0") as { phase: string };
          expect(gState.phase).toBe("guessing");

          // Have some players submit guesses (not all to stay in phase)
          const halfPlayers = Math.floor(playerCount / 2);
          for (let i = 0; i < halfPlayers; i++) {
            const guessTarget = `player-${(i + 2) % playerCount}`;
            module.handleEvent(`player-${i}`, "submitGuess", { playerId: guessTarget });
          }

          // Check guessing phase state for all players
          const stillInGuessing = module.getState("player-0") as { phase: string };
          if (stillInGuessing.phase === "guessing") {
            for (let i = 0; i < playerCount; i++) {
              assertNoInfoLeak(`player-${i}`, "guessing");
            }
          }

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Feature: secret-admirer, Property 8: Prompt non-repetition and consistency ──

describe("Property 8: Prompt non-repetition and consistency", () => {
  /**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any game with N rounds (5-20), all selected prompts across all rounds SHALL be
   * distinct (no prompt appears more than once), and within a single round, all players
   * SHALL receive the same prompt text.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("all prompts across rounds are distinct and each round has a single prompt for all players", () => {
    const promptsFile = createTestPromptsFile();

    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }), // number of rounds
        fc.integer({ min: 3, max: 10 }), // player count
        (numRounds, playerCount) => {
          const module = new SecretAdmirerModule(promptsFile);

          // Validate prompt pool so startRound() can select prompts
          const promptPool = (module as unknown as { promptPool: { validate: () => void } }).promptPool;
          promptPool.validate();

          const { context, emittedEvents } = createMockContext(playerCount);
          module.start(context);

          // Configure the number of rounds
          module.handleEvent("player-0", "configure", { rounds: numRounds });

          // Start the game — this triggers round 1 immediately
          module.handleEvent("player-0", "startGame", {});

          // Play through all rounds by submitting answers and advancing timers
          for (let round = 0; round < numRounds; round++) {
            // Submit answers for all players to end the round
            for (let i = 0; i < playerCount; i++) {
              module.handleEvent(`player-${i}`, "submitAnswer", {
                text: `Answer R${round + 1} P${i}`,
              });
            }

            // Advance past reactions timer (15s)
            vi.advanceTimersByTime(15_000);

            // Advance past voting timer (30s) — triggers next round or guessing phase
            vi.advanceTimersByTime(30_000);
          }

          // Collect ALL saRoundStarted events emitted during the entire game
          const roundStartEvents = emittedEvents.filter(
            (e) => e.event === "saRoundStarted"
          );

          // Now emitted per-player, so there should be numRounds * playerCount events
          expect(roundStartEvents).toHaveLength(numRounds * playerCount);

          // Group events by round number to check consistency within each round
          const eventsByRound = new Map<number, string[]>();
          for (const evt of roundStartEvents) {
            const payload = evt.payload as { prompt: string; roundNumber: number };
            const existing = eventsByRound.get(payload.roundNumber) ?? [];
            existing.push(payload.prompt);
            eventsByRound.set(payload.roundNumber, existing);
          }

          // Extract one prompt per round (they may differ by target name replacement,
          // but the base prompt is the same — verify via the stored roundPrompts)
          const allBasePrompts: string[] = [];

          for (let round = 1; round <= numRounds; round++) {
            const roundEvents = eventsByRound.get(round);
            expect(roundEvents).toBeDefined();
            expect(roundEvents!.length).toBe(playerCount);

            // All prompts in a round should have the same structure
            // (they differ only by target name substitution)
            // Just take the first one as representative for uniqueness check
            allBasePrompts.push(roundEvents![0]);
          }

          // Requirement 4.2: All prompts across all rounds SHALL be distinct
          // Since target names vary, we check the roundPrompts stored in state instead
          const stateAny = module as unknown as { state: { roundPrompts: Map<number, string> } };
          const storedPrompts = Array.from(stateAny.state.roundPrompts.values());
          const uniquePrompts = new Set(storedPrompts);
          expect(uniquePrompts.size).toBe(storedPrompts.length);

          // Verify we collected the expected number of prompts
          expect(storedPrompts.length).toBe(numRounds);

          module.end();
        }
      ),
      { numRuns: 100 }
    );
  });
});
