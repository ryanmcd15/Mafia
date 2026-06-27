import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpyfallModule } from "./SpyfallModule.js";
import { GameModuleContext } from "../../types.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockContext(playerCount: number) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    isConnected: true,
  }));

  const emittedEvents: Array<{ event: string; payload: unknown; target?: string }> = [];

  const context: GameModuleContext = {
    emitToRoom: (event, payload) => emittedEvents.push({ event, payload }),
    emitToPlayer: (socketId, event, payload) =>
      emittedEvents.push({ event, payload, target: socketId }),
    signalGameOver: (results) =>
      emittedEvents.push({ event: "signalGameOver", payload: results }),
    getPlayers: () => [...players],
  };

  return { players, context, emittedEvents };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("SpyfallModule Unit Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. Role Assignment ──────────────────────────────────────────

  describe("Role assignment with exactly 1 spy", () => {
    it("assigns exactly 1 spy with null location and 4 non-spies with actual location", () => {
      const { context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Collect roleAssigned events
      const roleEvents = emittedEvents.filter((e) => e.event === "roleAssigned");

      expect(roleEvents).toHaveLength(5);

      const spyEvents = roleEvents.filter(
        (e) => (e.payload as { isSpy: boolean }).isSpy === true
      );
      const nonSpyEvents = roleEvents.filter(
        (e) => (e.payload as { isSpy: boolean }).isSpy === false
      );

      // Exactly 1 spy
      expect(spyEvents).toHaveLength(1);
      // Spy has null location
      expect((spyEvents[0].payload as { location: string | null }).location).toBeNull();

      // 4 non-spies
      expect(nonSpyEvents).toHaveLength(4);
      // Each non-spy has an actual location string
      for (const event of nonSpyEvents) {
        const payload = event.payload as { location: string | null };
        expect(payload.location).not.toBeNull();
        expect(typeof payload.location).toBe("string");
        expect(payload.location!.length).toBeGreaterThan(0);
      }

      // All non-spies have the same location
      const locations = nonSpyEvents.map(
        (e) => (e.payload as { location: string }).location
      );
      expect(new Set(locations).size).toBe(1);
    });
  });

  // ─── 2. Turn Advancement and Equal Distribution ──────────────────

  describe("Turn advancement and equal distribution", () => {
    it("distributes turns equally across players after multiple answerComplete cycles", () => {
      const { players, context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Find the first questioner from the turnStarted event
      const firstTurnEvent = emittedEvents.find((e) => e.event === "turnStarted");
      expect(firstTurnEvent).toBeDefined();

      const totalCycles = 15; // 3 full rounds for 5 players
      const turnCounts = new Map<string, number>();
      for (const p of players) {
        turnCounts.set(p.id, 0);
      }

      for (let i = 0; i < totalCycles; i++) {
        // Get current questioner from state
        const state = module.getState(players[0].id) as {
          currentQuestioner: string;
          turnOrder: string[];
        };
        const questioner = state.currentQuestioner;
        turnCounts.set(questioner, (turnCounts.get(questioner) ?? 0) + 1);

        // Find a valid target (any player other than questioner)
        const target = players.find((p) => p.id !== questioner)!;

        // Select target then answer complete
        module.handleEvent(questioner, "selectTarget", { targetId: target.id });
        module.handleEvent(target.id, "answerComplete", {});
      }

      // After 15 turns with 5 players, each should have exactly 3 turns
      // (within floor/ceil of K/N = 15/5 = 3)
      const counts = [...turnCounts.values()];
      const expectedPerPlayer = totalCycles / players.length; // 3

      for (const count of counts) {
        expect(count).toBeGreaterThanOrEqual(Math.floor(expectedPerPlayer));
        expect(count).toBeLessThanOrEqual(Math.ceil(expectedPerPlayer));
      }
    });
  });

  // ─── 3. Timer Expiry Triggers Voting ─────────────────────────────

  describe("Timer expiry triggers voting", () => {
    it("transitions to voting phase when round timer expires after 480 seconds", () => {
      const { players, context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Advance timers by 480 seconds (the round duration)
      vi.advanceTimersByTime(480_000);

      // Verify phase changed to voting
      const phaseChangedEvents = emittedEvents.filter(
        (e) => e.event === "spyfallPhaseChanged"
      );
      expect(phaseChangedEvents.length).toBeGreaterThanOrEqual(1);

      const lastPhaseChange = phaseChangedEvents[phaseChangedEvents.length - 1];
      expect((lastPhaseChange.payload as { phase: string }).phase).toBe("voting");

      // Verify state reflects voting phase
      const state = module.getState(players[0].id) as { phase: string };
      expect(state.phase).toBe("voting");
    });
  });

  // ─── 4. callVote Immediately Transitions to Voting ───────────────

  describe("callVote immediately transitions to voting", () => {
    it("transitions to voting phase with 30s timer when callVote is emitted", () => {
      const { players, context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Any player calls a vote
      module.handleEvent(players[0].id, "callVote", {});

      // Verify phaseChanged event was emitted
      const phaseChangedEvents = emittedEvents.filter(
        (e) => e.event === "spyfallPhaseChanged"
      );
      expect(phaseChangedEvents.length).toBe(1);

      const payload = phaseChangedEvents[0].payload as {
        phase: string;
        timeRemaining: number;
      };
      expect(payload.phase).toBe("voting");
      expect(payload.timeRemaining).toBe(30);

      // Verify state reflects voting
      const state = module.getState(players[0].id) as { phase: string };
      expect(state.phase).toBe("voting");
    });
  });

  // ─── 5. Spy Guess Correct Outcome ───────────────────────────────

  describe("Spy guess correct outcome", () => {
    it("spy guessing the correct location results in 'Spy Wins'", () => {
      const { players, context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Determine who the spy is and what the location is from emitted events
      const roleEvents = emittedEvents.filter((e) => e.event === "roleAssigned");
      const spyEvent = roleEvents.find(
        (e) => (e.payload as { isSpy: boolean }).isSpy === true
      )!;
      const spyId = spyEvent.target!;

      // Get the actual location from a non-spy player
      const nonSpyEvent = roleEvents.find(
        (e) => (e.payload as { isSpy: boolean }).isSpy === false
      )!;
      const actualLocation = (nonSpyEvent.payload as { location: string }).location;

      // Spy guesses correctly
      module.handleEvent(spyId, "spyGuess", { location: actualLocation });

      // Verify gameOver with "Spy Wins"
      const gameOverEvents = emittedEvents.filter((e) => e.event === "gameOver");
      expect(gameOverEvents.length).toBe(1);
      expect((gameOverEvents[0].payload as { outcome: string }).outcome).toBe(
        "Spy Wins"
      );
    });
  });

  // ─── 6. Spy Guess Incorrect Outcome ─────────────────────────────

  describe("Spy guess incorrect outcome", () => {
    it("spy guessing a wrong location results in 'Players Win'", () => {
      const { players, context, emittedEvents } = createMockContext(5);
      const module = new SpyfallModule();
      module.start(context);

      // Determine who the spy is
      const roleEvents = emittedEvents.filter((e) => e.event === "roleAssigned");
      const spyEvent = roleEvents.find(
        (e) => (e.payload as { isSpy: boolean }).isSpy === true
      )!;
      const spyId = spyEvent.target!;

      // Get the actual location
      const nonSpyEvent = roleEvents.find(
        (e) => (e.payload as { isSpy: boolean }).isSpy === false
      )!;
      const actualLocation = (nonSpyEvent.payload as { location: string }).location;

      // Pick a wrong location (different from actual)
      const wrongLocation =
        actualLocation === "Airport" ? "Bank" : "Airport";

      // Spy guesses incorrectly
      module.handleEvent(spyId, "spyGuess", { location: wrongLocation });

      // Verify gameOver with "Players Win"
      const gameOverEvents = emittedEvents.filter((e) => e.event === "gameOver");
      expect(gameOverEvents.length).toBe(1);
      expect((gameOverEvents[0].payload as { outcome: string }).outcome).toBe(
        "Players Win"
      );
    });
  });

  // ─── 7. Disconnected Questioner Skip After 10s ──────────────────

  describe("Disconnected questioner skip after 10s", () => {
    it("skips to next player after 10s when current questioner disconnects", () => {
      const playerData = Array.from({ length: 5 }, (_, i) => ({
        id: `player-${i}`,
        name: `Player ${i}`,
        isConnected: true,
      }));

      const emittedEvents: Array<{ event: string; payload: unknown; target?: string }> = [];
      let currentPlayers = [...playerData];

      const context: GameModuleContext = {
        emitToRoom: (event, payload) => emittedEvents.push({ event, payload }),
        emitToPlayer: (socketId, event, payload) =>
          emittedEvents.push({ event, payload, target: socketId }),
        signalGameOver: (results) =>
          emittedEvents.push({ event: "signalGameOver", payload: results }),
        getPlayers: () => [...currentPlayers],
      };

      const module = new SpyfallModule();
      module.start(context);

      // Determine current questioner from state
      const state = module.getState(playerData[0].id) as {
        currentQuestioner: string;
      };
      const currentQuestioner = state.currentQuestioner;

      // Disconnect the current questioner
      currentPlayers = currentPlayers.map((p) =>
        p.id === currentQuestioner ? { ...p, isConnected: false } : p
      );
      module.handleDisconnect(currentQuestioner);

      // Advance timers by 10 seconds
      vi.advanceTimersByTime(10_000);

      // Check that a new turnStarted event was emitted with a different questioner
      const turnEvents = emittedEvents.filter((e) => e.event === "turnStarted");
      // Should have at least 2 (initial + after disconnect skip)
      expect(turnEvents.length).toBeGreaterThanOrEqual(2);

      const lastTurnEvent = turnEvents[turnEvents.length - 1];
      const newQuestioner = (lastTurnEvent.payload as { currentQuestioner: string })
        .currentQuestioner;
      expect(newQuestioner).not.toBe(currentQuestioner);
    });
  });
});
