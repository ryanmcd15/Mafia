import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MafiaModule } from "./MafiaModule.js";
import { GameModuleContext } from "../../types.js";
import { GamePhase, Role } from "./types.js";

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
  { id: "player4-socket", name: "Diana", isConnected: true },
];

/**
 * Helper to start a MafiaModule and get its internal state for assertions.
 * Returns the module, context, and a helper to find a player by role.
 */
function startGame(players = testPlayers) {
  const context = createMockContext(players);
  const module = new MafiaModule();
  module.start(context);
  return { module, context };
}

/**
 * Find the socketId of a player with a given role by inspecting getState results.
 */
function findPlayerByRole(module: MafiaModule, players: typeof testPlayers, role: Role): string | null {
  for (const p of players) {
    const state = module.getState(p.id) as Record<string, unknown> | null;
    if (state && state.myRole === role) {
      return p.id;
    }
  }
  return null;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("MafiaModule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. start/lifecycle tests ────────────────────────────────────

  describe("start() lifecycle", () => {
    it("assigns exactly 1 Killer, 1 Medic, and rest Civilian", () => {
      const { module } = startGame();

      const roles = testPlayers.map((p) => {
        const state = module.getState(p.id) as Record<string, unknown>;
        return state.myRole;
      });

      expect(roles.filter((r) => r === Role.Killer)).toHaveLength(1);
      expect(roles.filter((r) => r === Role.Medic)).toHaveLength(1);
      expect(roles.filter((r) => r === Role.Civilian)).toHaveLength(2);
    });

    it("emits roleAssigned to each player", () => {
      const { context } = startGame();

      expect(context.emitToPlayer).toHaveBeenCalledTimes(testPlayers.length);
      for (const p of testPlayers) {
        expect(context.emitToPlayer).toHaveBeenCalledWith(
          p.id,
          "roleAssigned",
          expect.objectContaining({ playerName: p.name })
        );
      }
    });

    it("transitions to RoleReveal phase", () => {
      const { module } = startGame();

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.RoleReveal);
    });

    it("emits phaseChanged to room", () => {
      const { context } = startGame();

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "phaseChanged",
        expect.objectContaining({ phase: GamePhase.RoleReveal })
      );
    });
  });

  describe("end() lifecycle", () => {
    it("clears all state after end()", () => {
      const { module } = startGame();

      module.end();

      // getState should return null for any player after end
      expect(module.getState(testPlayers[0].id)).toBeNull();
      expect(module.getState(testPlayers[1].id)).toBeNull();
    });
  });

  // ─── 2. handleEvent tests ───────────────────────────────────────

  describe("handleEvent - acknowledgeRole", () => {
    it("all players acknowledging transitions to Night", () => {
      const { module, context } = startGame();

      // All players acknowledge their role
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.Night);
    });

    it("partial acknowledgement does not transition", () => {
      const { module } = startGame();

      // Only first player acknowledges
      module.handleEvent(testPlayers[0].id, "acknowledgeRole", {});

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.RoleReveal);
    });
  });

  describe("handleEvent - nightAction", () => {
    function setupNightPhase() {
      const { module, context } = startGame();
      // Acknowledge all roles to transition to Night
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }
      return { module, context };
    }

    it("Killer nightAction sets killTarget", () => {
      const { module } = setupNightPhase();
      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const targetId = testPlayers.find((p) => p.id !== killerId)!.id;

      module.handleEvent(killerId, "nightAction", { targetId });

      const state = module.getState(killerId) as Record<string, unknown>;
      expect(state.myNightAction).toBe(targetId);
    });

    it("Medic nightAction sets saveTarget", () => {
      const { module } = setupNightPhase();
      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;
      const targetId = testPlayers.find((p) => p.id !== medicId)!.id;

      module.handleEvent(medicId, "nightAction", { targetId });

      const state = module.getState(medicId) as Record<string, unknown>;
      expect(state.myNightAction).toBe(targetId);
    });

    it("both Killer and Medic acting triggers night resolution (to Morning)", () => {
      const { module, context } = setupNightPhase();
      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;
      const targetId = testPlayers.find(
        (p) => p.id !== killerId && p.id !== medicId
      )!.id;

      module.handleEvent(killerId, "nightAction", { targetId });
      module.handleEvent(medicId, "nightAction", { targetId });

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.Morning);
    });
  });

  describe("handleEvent - submitVote / skipVote", () => {
    function setupVotingPhase() {
      const { module, context } = startGame();

      // Acknowledge all roles → Night
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      // Both Killer and Medic act → Morning
      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;
      // Killer targets someone who is NOT testPlayers[0] (the host) and not themselves/medic
      const victimId = testPlayers.find(
        (p) => p.id !== killerId && p.id !== medicId && p.id !== testPlayers[0].id
      )?.id ?? testPlayers.find((p) => p.id !== killerId && p.id !== medicId)!.id;
      // Medic saves someone else (so kill goes through)
      const saveId = testPlayers.find(
        (p) => p.id !== killerId && p.id !== victimId
      )!.id;

      module.handleEvent(killerId, "nightAction", { targetId: victimId });
      module.handleEvent(medicId, "nightAction", { targetId: saveId });

      // All connected players complete narration → Discussion
      for (const p of testPlayers) {
        module.handleEvent(p.id, "narrationComplete", {});
      }

      // Start discussion timer as host, then let it expire → accusation results shown
      module.handleEvent(testPlayers[0].id, "startDiscussionTimer", { duration: 10_000 });
      vi.advanceTimersByTime(10_000);
      // Advance past the 4-second accusation results delay → Voting
      vi.advanceTimersByTime(4_000);

      return { module, context, killerId, medicId, victimId };
    }

    it("submitVote records vote and emits voteRecorded", () => {
      const { module, context, victimId } = setupVotingPhase();

      // Find alive players who can vote
      const alivePlayers = testPlayers.filter((p) => {
        const state = module.getState(p.id) as Record<string, unknown>;
        return state && (state.isAlive as boolean);
      });

      // Clear previous calls
      (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

      const voter = alivePlayers[0];
      const target = alivePlayers.find((p) => p.id !== voter.id)!;
      module.handleEvent(voter.id, "submitVote", { targetId: target.id });

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "voteRecorded",
        expect.objectContaining({ voterId: voter.id })
      );
    });

    it("skipVote records skip vote and emits voteRecorded", () => {
      const { module, context } = setupVotingPhase();

      const alivePlayers = testPlayers.filter((p) => {
        const state = module.getState(p.id) as Record<string, unknown>;
        return state && (state.isAlive as boolean);
      });

      (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

      module.handleEvent(alivePlayers[0].id, "skipVote", {});

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "voteRecorded",
        expect.objectContaining({ voterId: alivePlayers[0].id })
      );
    });

    it("all votes trigger tally and emit voteResults", () => {
      const { module, context } = setupVotingPhase();

      const alivePlayers = testPlayers.filter((p) => {
        const state = module.getState(p.id) as Record<string, unknown>;
        return state && (state.isAlive as boolean);
      });

      (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

      // All alive players skip vote
      for (const p of alivePlayers) {
        module.handleEvent(p.id, "skipVote", {});
      }

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "voteResults",
        expect.objectContaining({ eliminatedPlayerId: null })
      );
    });
  });

  describe("handleEvent - unknown event", () => {
    it("unknown event types are ignored silently", () => {
      const { module, context } = startGame();

      // Should not throw
      module.handleEvent(testPlayers[0].id, "nonExistentEvent", { foo: "bar" });

      // Phase should remain unchanged
      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.RoleReveal);
    });
  });

  // ─── 3. getState tests ─────────────────────────────────────────

  describe("getState", () => {
    it("returns the player's own role but hides others' roles", () => {
      const { module } = startGame();

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      const players = state.players as Array<Record<string, unknown>>;

      // Own role is visible
      const selfEntry = players.find((p) => p.id === testPlayers[0].id);
      expect(selfEntry?.role).not.toBeNull();

      // Others' roles are hidden
      const otherEntries = players.filter((p) => p.id !== testPlayers[0].id);
      for (const entry of otherEntries) {
        expect(entry.role).toBeNull();
      }
    });

    it("includes myNightAction for Killer during Night", () => {
      const { module } = startGame();

      // Acknowledge to transition to Night
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const targetId = testPlayers.find((p) => p.id !== killerId)!.id;

      module.handleEvent(killerId, "nightAction", { targetId });

      const state = module.getState(killerId) as Record<string, unknown>;
      expect(state.myNightAction).toBe(targetId);
    });

    it("includes myNightAction for Medic during Night", () => {
      const { module } = startGame();

      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;
      const targetId = testPlayers.find((p) => p.id !== medicId)!.id;

      module.handleEvent(medicId, "nightAction", { targetId });

      const state = module.getState(medicId) as Record<string, unknown>;
      expect(state.myNightAction).toBe(targetId);
    });

    it("returns null for unknown socketId", () => {
      const { module } = startGame();

      expect(module.getState("unknown-socket")).toBeNull();
    });
  });

  // ─── 4. handleDisconnect tests ─────────────────────────────────

  describe("handleDisconnect", () => {
    it("marks player as not connected", () => {
      const { module, context } = startGame();

      module.handleDisconnect(testPlayers[1].id);

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      const players = state.players as Array<Record<string, unknown>>;
      const disconnected = players.find((p) => p.id === testPlayers[1].id);
      expect(disconnected?.isConnected).toBe(false);
    });

    it("emits playersUpdate on disconnect", () => {
      const { module, context } = startGame();
      (context.emitToRoom as ReturnType<typeof vi.fn>).mockClear();

      module.handleDisconnect(testPlayers[1].id);

      expect(context.emitToRoom).toHaveBeenCalledWith(
        "playersUpdate",
        expect.objectContaining({ players: expect.any(Array) })
      );
    });

    it("Killer disconnect during Night triggers night resolution", () => {
      const { module, context } = startGame();

      // Transition to Night
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;

      // Medic acts first
      const saveTarget = testPlayers.find(
        (p) => p.id !== killerId && p.id !== medicId
      )!.id;
      module.handleEvent(medicId, "nightAction", { targetId: saveTarget });

      // Killer disconnects (hasn't acted yet) → should trigger resolution
      module.handleDisconnect(killerId);

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.Morning);
    });

    it("Medic disconnect during Night triggers night resolution", () => {
      const { module, context } = startGame();

      // Transition to Night
      for (const p of testPlayers) {
        module.handleEvent(p.id, "acknowledgeRole", {});
      }

      const killerId = findPlayerByRole(module, testPlayers, Role.Killer)!;
      const medicId = findPlayerByRole(module, testPlayers, Role.Medic)!;

      // Killer acts first
      const killTarget = testPlayers.find(
        (p) => p.id !== killerId && p.id !== medicId
      )!.id;
      module.handleEvent(killerId, "nightAction", { targetId: killTarget });

      // Medic disconnects (hasn't acted yet) → should trigger resolution
      module.handleDisconnect(medicId);

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.Morning);
    });

    it("disconnect during RoleReveal auto-acknowledges for that player", () => {
      const { module } = startGame();

      // Manually acknowledge all except player2
      module.handleEvent(testPlayers[0].id, "acknowledgeRole", {});
      module.handleEvent(testPlayers[2].id, "acknowledgeRole", {});
      module.handleEvent(testPlayers[3].id, "acknowledgeRole", {});

      // player2 disconnects instead of acknowledging → should auto-acknowledge and trigger Night
      module.handleDisconnect(testPlayers[1].id);

      const state = module.getState(testPlayers[0].id) as Record<string, unknown>;
      expect(state.phase).toBe(GamePhase.Night);
    });
  });
});
