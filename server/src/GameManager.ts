import { GamePhase, GameState, Room } from "./types.js";
import { RoomManager } from "./RoomManager.js";
import { VoteManager } from "./VoteManager.js";
import { PhaseController } from "./PhaseController.js";

const DISCONNECT_TIMEOUT_MS = 60_000;
const MIN_PLAYERS_TO_START = 4;
const MAX_PLAYERS_TO_START = 10;

export class GameManager {
  private roomManager: RoomManager;
  private voteManager: VoteManager;
  private phaseController: PhaseController;

  /** Tracks disconnect removal timers: playerId -> NodeJS.Timeout */
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  /** Maps socketId -> roomCode for fast disconnect lookups */
  private playerRoomIndex: Map<string, string> = new Map();

  constructor(
    roomManager?: RoomManager,
    voteManager?: VoteManager,
    phaseController?: PhaseController
  ) {
    this.roomManager = roomManager ?? new RoomManager();
    this.voteManager = voteManager ?? new VoteManager();
    this.phaseController = phaseController ?? new PhaseController();
  }

  /**
   * Creates a new room with the given player as host.
   * Validates name (1-32 chars) via RoomManager, generates unique room code.
   * Requirements: 1.1–1.6
   */
  createRoom(
    playerName: string,
    socketId: string
  ): { roomCode: string; hostId: string } {
    const room = this.roomManager.createRoom(playerName, socketId);
    this.playerRoomIndex.set(socketId, room.roomCode);
    return { roomCode: room.roomCode, hostId: socketId };
  }

  /**
   * Joins an existing room with the given player name.
   * Validates: room exists, room in Lobby, name 1-20 chars, not full (max 10), name unique.
   * Requirements: 2.1–2.7
   */
  joinRoom(roomCode: string, playerName: string, socketId: string): Room {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found.");
    }

    this.roomManager.addPlayer(room, playerName, socketId);
    this.playerRoomIndex.set(socketId, roomCode);
    return room;
  }

  /**
   * Starts the game in the given room.
   * Only the host can start, room must be in Lobby, need 4-10 players.
   * Transitions to RoleReveal, assigns roles, initializes GameState.
   * Requirements: 4.1–4.4
   */
  startGame(roomCode: string, requesterId: string): Room {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (room.hostId !== requesterId) {
      throw new Error("Only the host can start the game.");
    }

    if (room.phase !== GamePhase.Lobby) {
      throw new Error("Game is already in progress.");
    }

    if (
      room.players.size < MIN_PLAYERS_TO_START ||
      room.players.size > MAX_PLAYERS_TO_START
    ) {
      throw new Error(
        `Need between ${MIN_PLAYERS_TO_START} and ${MAX_PLAYERS_TO_START} players to start.`
      );
    }

    // Initialize GameState
    const gameState: GameState = {
      nightActions: {
        killTarget: null,
        saveTarget: null,
      },
      votes: new Map(),
      eliminatedPlayers: [],
      phaseTimer: null,
      roleAcknowledgements: new Set(),
      narrationCompletes: new Set(),
      voteHistory: [],
      accusations: new Map(),
      accusationResults: null,
      round: 1,
    };
    room.gameState = gameState;

    // Assign roles
    this.phaseController.assignRoles(room);

    // Transition to RoleReveal
    this.phaseController.transitionTo(room, GamePhase.RoleReveal);

    return room;
  }

  /**
   * Returns the room with the given code, or null if not found.
   */
  getRoom(roomCode: string): Room | null {
    return this.roomManager.getRoom(roomCode);
  }

  /**
   * Handles a player disconnecting.
   * Finds the room containing the player, marks them as disconnected,
   * schedules a 60s removal timer, and transfers host if needed in Lobby.
   * Requirements: 16.3–16.5
   */
  handleDisconnect(playerId: string): void {
    const roomCode = this.playerRoomIndex.get(playerId);
    if (!roomCode) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      return;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return;
    }

    // Mark player as disconnected
    player.isConnected = false;
    player.disconnectedAt = new Date();

    // If host disconnects in Lobby, transfer host
    if (player.isHost && room.phase === GamePhase.Lobby) {
      this.roomManager.transferHost(room);
    }

    // Schedule 60s removal timer
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      this.playerRoomIndex.delete(playerId);
      this.roomManager.removePlayer(room, playerId);
    }, DISCONNECT_TIMEOUT_MS);

    this.disconnectTimers.set(playerId, timer);
  }

  /**
   * Handles a player reconnecting.
   * Finds the player in the room by name (case-sensitive), cancels their removal timer,
   * updates their socket ID in the players map (re-key), sets isConnected true, clears disconnectedAt.
   * Requirements: 16.4, 16.5
   */
  handleReconnect(
    roomCode: string,
    playerName: string,
    socketId: string
  ): Room {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error("Room not found.");
    }

    // Find the player by name (case-sensitive)
    let existingPlayer = null;
    let oldSocketId: string | null = null;
    for (const [id, player] of room.players.entries()) {
      if (player.name === playerName) {
        existingPlayer = player;
        oldSocketId = id;
        break;
      }
    }

    if (!existingPlayer || !oldSocketId) {
      throw new Error("Player not found in this room.");
    }

    // Cancel the removal timer if one exists
    const timer = this.disconnectTimers.get(oldSocketId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(oldSocketId);
    }

    // Re-key: remove old entry, update player, insert with new socketId
    room.players.delete(oldSocketId);
    existingPlayer.id = socketId;
    existingPlayer.isConnected = true;
    existingPlayer.disconnectedAt = null;
    room.players.set(socketId, existingPlayer);

    // Update player-room index
    this.playerRoomIndex.delete(oldSocketId);
    this.playerRoomIndex.set(socketId, roomCode);

    // Update hostId if this player is the host
    if (existingPlayer.isHost) {
      room.hostId = socketId;
    }

    return room;
  }
}
