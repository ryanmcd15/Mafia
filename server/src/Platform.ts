import { Server } from "socket.io";
import { RoomManager } from "./RoomManager.js";
import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
  PlatformPhase,
  PlatformRoom,
} from "./types.js";

export class Platform {
  private roomManager: RoomManager;
  private gameRegistry: Map<string, { factory: () => GameModule; config: GameModuleConfig }>;
  private activeGames: Map<string, GameModule>;
  private playerRoomIndex: Map<string, string>;
  private disconnectTimers: Map<string, NodeJS.Timeout>;
  private io: Server;

  constructor(io: Server, roomManager?: RoomManager) {
    this.io = io;
    this.roomManager = roomManager ?? new RoomManager();
    this.gameRegistry = new Map();
    this.activeGames = new Map();
    this.playerRoomIndex = new Map();
    this.disconnectTimers = new Map();
  }

  /**
   * Register a game module factory with its config.
   */
  registerGame(gameId: string, factory: () => GameModule, config: GameModuleConfig): void {
    this.gameRegistry.set(gameId, { factory, config });
  }

  /**
   * Get all registered game configs for the Game Selection Screen.
   */
  getAvailableGames(): Array<{ id: string; config: GameModuleConfig }> {
    const games: Array<{ id: string; config: GameModuleConfig }> = [];
    for (const [id, entry] of this.gameRegistry) {
      games.push({ id, config: entry.config });
    }
    return games;
  }

  /**
   * Create a new room. The room starts in Lobby phase.
   */
  createRoom(playerName: string, socketId: string): { roomCode: string; hostId: string } {
    const room = this.roomManager.createRoom(playerName, socketId);
    this.playerRoomIndex.set(socketId, room.roomCode);
    return { roomCode: room.roomCode, hostId: room.hostId };
  }

  /**
   * Emit roomUpdated event for a given room code (used after socket.join).
   */
  emitRoomUpdatedForRoom(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (room) {
      this.emitRoomUpdated(room);
    }
  }

  /**
   * Get the room code associated with a socket ID.
   */
  getRoomCodeForSocket(socketId: string): string | undefined {
    return this.playerRoomIndex.get(socketId);
  }

  /**
   * Get current game state for a specific player (used for late-joining / state sync).
   */
  getGameState(roomCode: string, socketId: string): unknown {
    const gameModule = this.activeGames.get(roomCode);
    if (!gameModule) return null;
    return gameModule.getState(socketId);
  }

  /**
   * Join an existing room by room code.
   */
  joinRoom(roomCode: string, playerName: string, socketId: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found");
    }
    this.roomManager.addPlayer(room, playerName, socketId);
    this.playerRoomIndex.set(socketId, roomCode);
  }

  /**
   * Host selects a game to play.
   * Validates host permissions, game existence, and player count.
   */
  selectGame(roomCode: string, gameId: string, requesterId: string): void {
    const room = this.getRoomOrThrow(roomCode);
    this.assertHost(room, requesterId);

    const entry = this.gameRegistry.get(gameId);
    if (!entry) {
      throw new Error("Game not available");
    }

    const connectedPlayerCount = this.getConnectedPlayerCount(room);
    if (connectedPlayerCount < entry.config.minPlayers) {
      throw new Error(
        `Need at least ${entry.config.minPlayers} players to start ${entry.config.name}`
      );
    }
    if (connectedPlayerCount > entry.config.maxPlayers) {
      throw new Error(
        `${entry.config.name} supports at most ${entry.config.maxPlayers} players`
      );
    }

    // Create game module instance
    const gameModule = entry.factory();

    // Store as active game
    this.activeGames.set(roomCode, gameModule);

    // Update room state
    room.platformPhase = PlatformPhase.ActiveGame;
    room.activeGameId = gameId;

    // Build context for the game module
    const context = this.buildGameContext(room);

    // Start the game
    gameModule.start(context);

    // Notify all players
    this.io.to(roomCode).emit("gameSelected", {
      gameId,
      config: entry.config,
    });
  }

  /**
   * Route a game-specific event to the active module.
   */
  handleGameEvent(roomCode: string, socketId: string, eventType: string, payload: unknown): void {
    const gameModule = this.activeGames.get(roomCode);
    if (!gameModule) {
      throw new Error("No active game in this room");
    }
    gameModule.handleEvent(socketId, eventType, payload);
  }

  /**
   * Handle player disconnect: mark disconnected, start 60s retention timer.
   */
  handleDisconnect(socketId: string): void {
    const roomCode = this.playerRoomIndex.get(socketId);
    if (!roomCode) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      this.playerRoomIndex.delete(socketId);
      return;
    }

    const player = room.players.get(socketId);
    if (!player) {
      this.playerRoomIndex.delete(socketId);
      return;
    }

    // Mark player as disconnected
    player.isConnected = false;
    player.disconnectedAt = new Date();

    // Transfer host if the disconnecting player is the host
    if (player.isHost) {
      this.roomManager.transferHost(room);
    }

    // Notify active game module
    const gameModule = this.activeGames.get(roomCode);
    if (gameModule) {
      gameModule.handleDisconnect(socketId);
    }

    // Emit room update
    this.emitRoomUpdated(room);

    // Start 60-second retention timer
    const timer = setTimeout(() => {
      this.handlePlayerRemoval(socketId, roomCode);
    }, 60_000);

    this.disconnectTimers.set(socketId, timer);
  }

  /**
   * Handle player reconnect: restore state, clear timer.
   */
  handleReconnect(roomCode: string, playerName: string, socketId: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found");
    }

    // Find the player by name
    let existingPlayer = null;
    let oldSocketId: string | null = null;
    for (const [id, p] of room.players) {
      if (p.name === playerName) {
        existingPlayer = p;
        oldSocketId = id;
        break;
      }
    }

    if (!existingPlayer || !oldSocketId) {
      throw new Error("Player not found in room");
    }

    // Clear disconnect timer
    const timer = this.disconnectTimers.get(oldSocketId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(oldSocketId);
    }

    // Update player's socket ID and connection status
    existingPlayer.id = socketId;
    existingPlayer.isConnected = true;
    existingPlayer.disconnectedAt = null;

    // Update room's player map (re-key under new socketId)
    room.players.delete(oldSocketId);
    room.players.set(socketId, existingPlayer);

    // If this player is the host, update hostId
    if (existingPlayer.isHost) {
      room.hostId = socketId;
    }

    // Update playerRoomIndex
    this.playerRoomIndex.delete(oldSocketId);
    this.playerRoomIndex.set(socketId, roomCode);

    // Emit room update
    this.emitRoomUpdated(room);

    // If game is active, send current game state to the reconnecting player
    const gameModule = this.activeGames.get(roomCode);
    if (gameModule && room.platformPhase === PlatformPhase.ActiveGame) {
      const gameState = gameModule.getState(socketId);
      this.io.to(socketId).emit("gameState", gameState);
    }
  }

  /**
   * Host triggers return to game selection, clearing game state.
   */
  returnToGameSelection(roomCode: string, requesterId: string): void {
    const room = this.getRoomOrThrow(roomCode);
    this.assertHost(room, requesterId);

    // End active game if any
    const gameModule = this.activeGames.get(roomCode);
    if (gameModule) {
      gameModule.end();
      this.activeGames.delete(roomCode);
    }

    // Reset room phase
    room.platformPhase = PlatformPhase.Lobby;
    room.activeGameId = null;

    // Notify all players
    this.emitRoomUpdated(room);
  }

  /**
   * Host ends the session entirely, terminating the room.
   */
  endSession(roomCode: string, requesterId: string): void {
    const room = this.getRoomOrThrow(roomCode);
    this.assertHost(room, requesterId);

    // End active game if any
    const gameModule = this.activeGames.get(roomCode);
    if (gameModule) {
      gameModule.end();
      this.activeGames.delete(roomCode);
    }

    // Notify all players before removing
    this.io.to(roomCode).emit("sessionEnded", { roomCode });

    // Clean up all players from playerRoomIndex and disconnect timers
    for (const [socketId] of room.players) {
      this.playerRoomIndex.delete(socketId);
      const timer = this.disconnectTimers.get(socketId);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(socketId);
      }
    }

    // Remove all players from the room (which will delete the room)
    const playerIds = [...room.players.keys()];
    for (const playerId of playerIds) {
      this.roomManager.removePlayer(room, playerId);
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private getRoomOrThrow(roomCode: string): PlatformRoom {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }

  private assertHost(room: PlatformRoom, requesterId: string): void {
    if (room.hostId !== requesterId) {
      throw new Error("Insufficient permissions");
    }
  }

  private getConnectedPlayerCount(room: PlatformRoom): number {
    let count = 0;
    for (const player of room.players.values()) {
      if (player.isConnected) {
        count++;
      }
    }
    return count;
  }

  private buildGameContext(room: PlatformRoom): GameModuleContext {
    const roomCode = room.roomCode;
    return {
      emitToRoom: (event: string, payload: unknown) => {
        this.io.to(roomCode).emit(event, payload);
      },
      emitToPlayer: (socketId: string, event: string, payload: unknown) => {
        this.io.to(socketId).emit(event, payload);
      },
      signalGameOver: (results: unknown) => {
        room.platformPhase = PlatformPhase.GameResults;
        this.io.to(roomCode).emit("gameOver", { results });
      },
      getPlayers: () => {
        const players: Array<{ id: string; name: string; isConnected: boolean }> = [];
        for (const player of room.players.values()) {
          players.push({
            id: player.id,
            name: player.name,
            isConnected: player.isConnected,
          });
        }
        return players;
      },
    };
  }

  private emitRoomUpdated(room: PlatformRoom): void {
    const players = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isConnected: p.isConnected,
      disconnectedAt: p.disconnectedAt,
      color: p.color,
    }));

    const availableGames = this.getAvailableGames().map((g) => g.config);

    this.io.to(room.roomCode).emit("roomUpdated", {
      roomCode: room.roomCode,
      hostId: room.hostId,
      platformPhase: room.platformPhase,
      activeGameId: room.activeGameId,
      players,
      availableGames,
    });
  }

  private handlePlayerRemoval(socketId: string, roomCode: string): void {
    this.disconnectTimers.delete(socketId);
    this.playerRoomIndex.delete(socketId);

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      return;
    }

    const player = room.players.get(socketId);
    if (!player) {
      return;
    }

    const playerName = player.name;

    // If the removed player was host, transfer host first
    if (player.isHost) {
      this.roomManager.transferHost(room);
    }

    // Notify active game module of permanent removal (Req 16.5, 19.4)
    const gameModule = this.activeGames.get(roomCode);
    if (gameModule && room.platformPhase === PlatformPhase.ActiveGame) {
      if (typeof gameModule.handlePlayerRemoval === "function") {
        gameModule.handlePlayerRemoval(socketId);
      }
    }

    // Remove from room
    this.roomManager.removePlayer(room, socketId);

    // If room still exists after removal, emit notification and update
    const updatedRoom = this.roomManager.getRoom(roomCode);
    if (updatedRoom) {
      // Emit player removal notification to remaining players (Req 19.4)
      this.io.to(roomCode).emit("playerRemoved", {
        playerName,
        reason: "Disconnection timeout (60s)",
      });
      this.emitRoomUpdated(updatedRoom);
    }
  }
}
