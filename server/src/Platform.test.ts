import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { Server } from "socket.io";
import { Platform } from "./Platform.js";
import { RoomManager } from "./RoomManager.js";
import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
  PlatformPhase,
} from "./types.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockIo() {
  const emitFn = vi.fn();
  const toFn = vi.fn().mockReturnValue({ emit: emitFn });
  return {
    io: { to: toFn } as unknown as Server,
    toFn,
    emitFn,
  };
}

function createMockGameModule(config?: Partial<GameModuleConfig>): GameModule {
  return {
    config: {
      id: config?.id ?? "test-game",
      name: config?.name ?? "Test Game",
      minPlayers: config?.minPlayers ?? 2,
      maxPlayers: config?.maxPlayers ?? 10,
      description: config?.description ?? "A test game",
    },
    start: vi.fn(),
    handleEvent: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    handleDisconnect: vi.fn(),
    end: vi.fn(),
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/** Generates valid player names (1-20 chars, alphanumeric + spaces) */
const playerNameArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ".split("")),
  { minLength: 1, maxLength: 20 }
);

/** Generates valid host names (1-32 chars) */
const hostNameArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ".split("")),
  { minLength: 1, maxLength: 32 }
);

/** Generates unique socket IDs */
const socketIdArb = fc.uuid();

/** Generates arbitrary strings for unrecognized game IDs */
const arbitraryStringArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generates event type strings */
const eventTypeArb = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
  { minLength: 1, maxLength: 30 }
);

// ─── Property Tests ──────────────────────────────────────────────────

describe("Platform Property Tests", () => {
  let mockIo: ReturnType<typeof createMockIo>;

  beforeEach(() => {
    mockIo = createMockIo();
  });

  // Feature: party-games-platform, Property 4: Host-only action authorization
  describe("Property 4: Host-only action authorization", () => {
    /**
     * Validates: Requirements 2.5
     *
     * For any room and any non-host player, attempting to perform host-only
     * actions (selectGame, returnToGameSelection, endSession) SHALL be rejected
     * with an "Insufficient permissions" error message.
     */
    it("non-host players cannot perform host-only actions", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          playerNameArb,
          socketIdArb,
          socketIdArb,
          (hostName, playerName, hostSocketId, playerSocketId) => {
            // Ensure distinct socket IDs and names
            fc.pre(hostSocketId !== playerSocketId);
            fc.pre(hostName !== playerName);

            const platform = new Platform(mockIo.io);
            const { roomCode } = platform.createRoom(hostName, hostSocketId);
            platform.joinRoom(roomCode, playerName, playerSocketId);

            // selectGame should reject non-host
            expect(() => {
              platform.selectGame(roomCode, "any-game", playerSocketId);
            }).toThrow("Insufficient permissions");

            // returnToGameSelection should reject non-host
            expect(() => {
              platform.returnToGameSelection(roomCode, playerSocketId);
            }).toThrow("Insufficient permissions");

            // endSession should reject non-host
            expect(() => {
              platform.endSession(roomCode, playerSocketId);
            }).toThrow("Insufficient permissions");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 5: Valid game selection loads module
  describe("Property 5: Valid game selection loads module", () => {
    /**
     * Validates: Requirements 2.4
     *
     * For any registered game ID selected by the host while the room is in
     * Lobby phase with sufficient players, the server SHALL load the corresponding
     * Game_Module, transition to ActiveGame, and emit a `gameSelected` event.
     */
    it("host selecting a registered game with sufficient players loads the module", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          fc.array(playerNameArb, { minLength: 1, maxLength: 5 }),
          fc.array(socketIdArb, { minLength: 6, maxLength: 6 }),
          fc.constantFrom("game-a", "game-b", "game-c"),
          (hostName, playerNames, socketIds, gameId) => {
            // Ensure unique socket IDs
            const uniqueSocketIds = [...new Set(socketIds)];
            fc.pre(uniqueSocketIds.length >= 2);

            const hostSocketId = uniqueSocketIds[0];
            // Create unique player names different from host
            const usedNames = new Set<string>([hostName]);
            const validPlayerNames: string[] = [];
            for (const name of playerNames) {
              if (!usedNames.has(name) && name.trim().length > 0) {
                usedNames.add(name);
                validPlayerNames.push(name);
              }
            }
            fc.pre(validPlayerNames.length >= 1);

            const { io, toFn, emitFn } = createMockIo();
            const platform = new Platform(io);

            // Register game with minPlayers: 2
            const mockModule = createMockGameModule({ id: gameId, minPlayers: 2, maxPlayers: 10 });
            platform.registerGame(gameId, () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);

            // Add at least one more player
            const playerSocketId = uniqueSocketIds[1];
            platform.joinRoom(roomCode, validPlayerNames[0], playerSocketId);

            // Reset mocks after join emits
            emitFn.mockClear();
            toFn.mockClear();

            // Host selects the game
            platform.selectGame(roomCode, gameId, hostSocketId);

            // Module's start method should have been called
            expect(mockModule.start).toHaveBeenCalledTimes(1);

            // gameSelected event should have been emitted to the room
            expect(toFn).toHaveBeenCalledWith(roomCode);
            expect(emitFn).toHaveBeenCalledWith("gameSelected", expect.objectContaining({
              gameId,
              config: mockModule.config,
            }));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 6: Unrecognized game ID rejection
  describe("Property 6: Unrecognized game ID rejection", () => {
    /**
     * Validates: Requirements 2.6
     *
     * For any string that is not a registered game module ID, a selectGame
     * event SHALL be rejected with an error indicating the game is not available.
     */
    it("selecting an unregistered game ID is rejected", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          socketIdArb,
          arbitraryStringArb,
          (hostName, hostSocketId, unknownGameId) => {
            // Ensure the unknownGameId is not one of the registered ones
            const registeredIds = ["registered-game"];
            fc.pre(!registeredIds.includes(unknownGameId));

            const platform = new Platform(mockIo.io);
            const mockModule = createMockGameModule({ id: "registered-game" });
            platform.registerGame("registered-game", () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);

            expect(() => {
              platform.selectGame(roomCode, unknownGameId, hostSocketId);
            }).toThrow("Game not available");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 7: Player count enforcement per game
  describe("Property 7: Player count enforcement per game", () => {
    /**
     * Validates: Requirements 2.8, 3.6
     *
     * For any room with N players and any game requiring minPlayers > N or
     * maxPlayers < N, attempting to start that game SHALL be rejected.
     */
    it("rejects game selection when player count is below minimum", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          socketIdArb,
          fc.integer({ min: 3, max: 10 }),
          (hostName, hostSocketId, minPlayers) => {
            // Room with only 1 player (the host), game requires minPlayers > 1
            const platform = new Platform(mockIo.io);
            const mockModule = createMockGameModule({
              id: "high-min-game",
              minPlayers,
              maxPlayers: 10,
            });
            platform.registerGame("high-min-game", () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);

            // Only host is in the room (1 player), game requires minPlayers >= 3
            expect(() => {
              platform.selectGame(roomCode, "high-min-game", hostSocketId);
            }).toThrow(/Need at least/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejects game selection when player count exceeds maximum", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          fc.array(playerNameArb, { minLength: 3, maxLength: 5 }),
          fc.array(socketIdArb, { minLength: 6, maxLength: 6 }),
          fc.integer({ min: 1, max: 2 }),
          (hostName, playerNames, socketIds, maxPlayers) => {
            const uniqueSocketIds = [...new Set(socketIds)];
            fc.pre(uniqueSocketIds.length >= 4);

            const hostSocketId = uniqueSocketIds[0];
            const usedNames = new Set<string>([hostName]);
            const validPlayerNames: string[] = [];
            for (const name of playerNames) {
              if (!usedNames.has(name) && name.trim().length > 0) {
                usedNames.add(name);
                validPlayerNames.push(name);
              }
            }
            // Need more players than maxPlayers
            fc.pre(validPlayerNames.length >= maxPlayers);

            const platform = new Platform(mockIo.io);
            const mockModule = createMockGameModule({
              id: "low-max-game",
              minPlayers: 1,
              maxPlayers,
            });
            platform.registerGame("low-max-game", () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);

            // Add players exceeding max
            for (let i = 0; i < validPlayerNames.length && i < uniqueSocketIds.length - 1; i++) {
              platform.joinRoom(roomCode, validPlayerNames[i], uniqueSocketIds[i + 1]);
            }

            // Total players = host + joined players > maxPlayers
            expect(() => {
              platform.selectGame(roomCode, "low-max-game", hostSocketId);
            }).toThrow(/supports at most/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 8: Game over returns to GameResults preserving players
  describe("Property 8: Game over returns to GameResults preserving players", () => {
    /**
     * Validates: Requirements 3.3, 3.4
     *
     * For any game module that signals game over, the Platform SHALL transition
     * the room to GameResults phase, retaining all currently connected players.
     */
    it("signalGameOver transitions to GameResults and retains all players", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          fc.array(playerNameArb, { minLength: 1, maxLength: 4 }),
          fc.array(socketIdArb, { minLength: 6, maxLength: 6 }),
          fc.anything(),
          (hostName, playerNames, socketIds, results) => {
            const uniqueSocketIds = [...new Set(socketIds)];
            fc.pre(uniqueSocketIds.length >= 2);

            const hostSocketId = uniqueSocketIds[0];
            const usedNames = new Set<string>([hostName]);
            const validPlayerNames: string[] = [];
            for (const name of playerNames) {
              if (!usedNames.has(name) && name.trim().length > 0) {
                usedNames.add(name);
                validPlayerNames.push(name);
              }
            }
            fc.pre(validPlayerNames.length >= 1);

            const { io, toFn, emitFn } = createMockIo();
            const platform = new Platform(io);

            // Create a game module whose start captures the context
            let capturedContext: GameModuleContext | null = null;
            const mockModule: GameModule = {
              config: {
                id: "context-game",
                name: "Context Game",
                minPlayers: 2,
                maxPlayers: 10,
                description: "A game to capture context",
              },
              start: vi.fn((ctx: GameModuleContext) => {
                capturedContext = ctx;
              }),
              handleEvent: vi.fn(),
              getState: vi.fn().mockReturnValue({}),
              handleDisconnect: vi.fn(),
              end: vi.fn(),
            };
            platform.registerGame("context-game", () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);

            // Add players
            const joinedSocketIds: string[] = [];
            for (let i = 0; i < validPlayerNames.length && i < uniqueSocketIds.length - 1; i++) {
              platform.joinRoom(roomCode, validPlayerNames[i], uniqueSocketIds[i + 1]);
              joinedSocketIds.push(uniqueSocketIds[i + 1]);
            }

            // Select the game
            platform.selectGame(roomCode, "context-game", hostSocketId);

            // Clear mocks before signaling game over
            emitFn.mockClear();
            toFn.mockClear();

            // Signal game over via captured context
            expect(capturedContext).not.toBeNull();
            capturedContext!.signalGameOver(results);

            // Verify gameOver event was emitted
            expect(toFn).toHaveBeenCalledWith(roomCode);
            expect(emitFn).toHaveBeenCalledWith("gameOver", { results });

            // Verify all players are still accessible via the platform
            // by checking we can still get context players
            const players = capturedContext!.getPlayers();
            const totalExpected = 1 + joinedSocketIds.length; // host + joined
            expect(players.length).toBe(totalExpected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 25: Disconnect/reconnect round-trip preserves state
  describe("Property 25: Disconnect/reconnect round-trip preserves state", () => {
    /**
     * Validates: Requirements 16.3, 16.4
     *
     * For any player who disconnects and reconnects within 60 seconds using
     * the same room code and player name, the Platform SHALL restore that
     * player's state (including game state via `getState`) identically to
     * before disconnection.
     */
    it("disconnect then reconnect preserves player state and restores game state", () => {
      vi.useFakeTimers();
      try {
        fc.assert(
          fc.property(
            hostNameArb,
            playerNameArb,
            socketIdArb,
            socketIdArb,
            socketIdArb,
            fc.anything(),
            (hostName, playerName, hostSocketId, playerSocketId, newSocketId, gameState) => {
              // Ensure distinct socket IDs and names
              fc.pre(hostSocketId !== playerSocketId);
              fc.pre(hostSocketId !== newSocketId);
              fc.pre(playerSocketId !== newSocketId);
              fc.pre(hostName !== playerName);

              const { io, toFn, emitFn } = createMockIo();
              const platform = new Platform(io);

              // Register and set up a game module with controlled getState
              const mockModule = createMockGameModule({ id: "reconnect-game", minPlayers: 2, maxPlayers: 10 });
              (mockModule.getState as ReturnType<typeof vi.fn>).mockReturnValue(gameState);
              platform.registerGame("reconnect-game", () => mockModule, mockModule.config);

              // Create room and add a player
              const { roomCode } = platform.createRoom(hostName, hostSocketId);
              platform.joinRoom(roomCode, playerName, playerSocketId);

              // Start the game so there's active game state
              platform.selectGame(roomCode, "reconnect-game", hostSocketId);

              // Clear mocks before disconnect/reconnect sequence
              emitFn.mockClear();
              toFn.mockClear();
              (mockModule.getState as ReturnType<typeof vi.fn>).mockClear();
              (mockModule.getState as ReturnType<typeof vi.fn>).mockReturnValue(gameState);

              // Disconnect the player
              platform.handleDisconnect(playerSocketId);

              // Reconnect with a new socketId (within 60s)
              platform.handleReconnect(roomCode, playerName, newSocketId);

              // Verify: getState was called with the new socketId
              expect(mockModule.getState).toHaveBeenCalledWith(newSocketId);

              // Verify: gameState event emitted to the new socketId
              expect(toFn).toHaveBeenCalledWith(newSocketId);
              expect(emitFn).toHaveBeenCalledWith("gameState", gameState);
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Feature: party-games-platform, Property 27: Host disconnect transfers host during active game
  describe("Property 27: Host disconnect transfers host during active game", () => {
    /**
     * Validates: Requirements 19.5, 3.5
     *
     * For any room where the host disconnects during an active game, the
     * Platform SHALL transfer host status to the next connected player and
     * emit a roomUpdated event.
     */
    it("host disconnect transfers host to next connected player during active game", () => {
      vi.useFakeTimers();
      try {
        fc.assert(
          fc.property(
            hostNameArb,
            fc.array(playerNameArb, { minLength: 1, maxLength: 5 }),
            fc.array(socketIdArb, { minLength: 7, maxLength: 7 }),
            (hostName, playerNames, socketIds) => {
              const uniqueSocketIds = [...new Set(socketIds)];
              fc.pre(uniqueSocketIds.length >= 2);

              const hostSocketId = uniqueSocketIds[0];
              const usedNames = new Set<string>([hostName]);
              const validPlayerNames: string[] = [];
              for (const name of playerNames) {
                if (!usedNames.has(name) && name.trim().length > 0) {
                  usedNames.add(name);
                  validPlayerNames.push(name);
                }
              }
              fc.pre(validPlayerNames.length >= 1);

              const { io, toFn, emitFn } = createMockIo();
              const platform = new Platform(io);

              // Register a mock game module
              const mockModule = createMockGameModule({ id: "disconnect-game", minPlayers: 2, maxPlayers: 10 });
              platform.registerGame("disconnect-game", () => mockModule, mockModule.config);

              // Create room and add players
              const { roomCode } = platform.createRoom(hostName, hostSocketId);

              const otherPlayerSocketIds: string[] = [];
              for (let i = 0; i < validPlayerNames.length && i < uniqueSocketIds.length - 1; i++) {
                platform.joinRoom(roomCode, validPlayerNames[i], uniqueSocketIds[i + 1]);
                otherPlayerSocketIds.push(uniqueSocketIds[i + 1]);
              }

              // Start an active game
              platform.selectGame(roomCode, "disconnect-game", hostSocketId);

              // Clear mocks before disconnect
              emitFn.mockClear();
              toFn.mockClear();

              // Disconnect the host
              platform.handleDisconnect(hostSocketId);

              // Verify roomUpdated was emitted
              expect(toFn).toHaveBeenCalledWith(roomCode);
              expect(emitFn).toHaveBeenCalledWith(
                "roomUpdated",
                expect.objectContaining({
                  roomCode,
                  hostId: expect.any(String),
                })
              );

              // Find the roomUpdated call payload
              const roomUpdatedCall = emitFn.mock.calls.find(
                (call: unknown[]) => call[0] === "roomUpdated"
              );
              expect(roomUpdatedCall).toBeDefined();

              const roomUpdatedPayload = roomUpdatedCall![1] as {
                hostId: string;
                players: Array<{ id: string; isHost: boolean; isConnected: boolean }>;
              };

              // New host must NOT be the disconnected host
              expect(roomUpdatedPayload.hostId).not.toBe(hostSocketId);

              // New host must be one of the remaining connected players
              expect(otherPlayerSocketIds).toContain(roomUpdatedPayload.hostId);

              // Verify that the new host player has isHost: true in the payload
              const newHostPlayer = roomUpdatedPayload.players.find(
                (p) => p.id === roomUpdatedPayload.hostId
              );
              expect(newHostPlayer).toBeDefined();
              expect(newHostPlayer!.isHost).toBe(true);

              // Verify the disconnected host no longer has isHost: true
              const oldHostPlayer = roomUpdatedPayload.players.find(
                (p) => p.id === hostSocketId
              );
              expect(oldHostPlayer).toBeDefined();
              expect(oldHostPlayer!.isHost).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Feature: party-games-platform, Property 9: Game event routing to active module
  describe("Property 9: Game event routing to active module", () => {
    /**
     * Validates: Requirements 3.4
     *
     * For any game-specific event emitted while a Game_Module is active, the
     * Platform SHALL route that event to the active module's handleEvent method
     * with the correct socketId and payload.
     */
    it("game events are routed to the active module with correct socketId and payload", () => {
      fc.assert(
        fc.property(
          hostNameArb,
          playerNameArb,
          socketIdArb,
          socketIdArb,
          eventTypeArb,
          fc.anything(),
          (hostName, playerName, hostSocketId, playerSocketId, eventType, payload) => {
            fc.pre(hostSocketId !== playerSocketId);
            fc.pre(hostName !== playerName);

            const platform = new Platform(mockIo.io);

            const mockModule = createMockGameModule({ id: "route-game", minPlayers: 2, maxPlayers: 10 });
            platform.registerGame("route-game", () => mockModule, mockModule.config);

            const { roomCode } = platform.createRoom(hostName, hostSocketId);
            platform.joinRoom(roomCode, playerName, playerSocketId);

            // Select game as host
            platform.selectGame(roomCode, "route-game", hostSocketId);

            // Clear prior mock calls
            (mockModule.handleEvent as ReturnType<typeof vi.fn>).mockClear();

            // Route a game event from a player
            platform.handleGameEvent(roomCode, playerSocketId, eventType, payload);

            // Verify handleEvent was called with correct args
            expect(mockModule.handleEvent).toHaveBeenCalledTimes(1);
            expect(mockModule.handleEvent).toHaveBeenCalledWith(
              playerSocketId,
              eventType,
              payload
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
