import { PlatformPhase, PlatformPlayer, PlatformRoom } from "./types.js";

const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_CODE_LENGTH = 6;
const MAX_ROOM_CODE_ATTEMPTS = 10;
const MAX_HOST_NAME_LENGTH = 32;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_PLAYERS_PER_ROOM = 10;

const PLAYER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9",
];

let colorIndex = 0;
function getNextColor(): string {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
  colorIndex++;
  return color;
}

export class RoomManager {
  private rooms: Map<string, PlatformRoom> = new Map();

  /**
   * Generates a random 6-character uppercase alphanumeric room code.
   * Tries up to 10 times to avoid collisions.
   * Returns null if all attempts collide with existing room codes.
   */
  generateRoomCode(): string | null {
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS.charAt(
          Math.floor(Math.random() * ROOM_CODE_CHARS.length)
        );
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return null;
  }

  /**
   * Creates a new room with the given host.
   * Validates hostName (1–32 chars), generates a unique room code,
   * and stores the room in the internal map.
   */
  createRoom(hostName: string, socketId: string): PlatformRoom {
    if (!hostName || hostName.length < 1 || hostName.length > MAX_HOST_NAME_LENGTH) {
      throw new Error(
        `Host name must be between 1 and ${MAX_HOST_NAME_LENGTH} characters.`
      );
    }

    const roomCode = this.generateRoomCode();
    if (roomCode === null) {
      throw new Error("Service temporarily unavailable. Please try again.");
    }

    const host: PlatformPlayer = {
      id: socketId,
      name: hostName,
      isHost: true,
      isConnected: true,
      disconnectedAt: null,
      color: getNextColor(),
    };

    const room: PlatformRoom = {
      roomCode,
      hostId: socketId,
      players: new Map([[socketId, host]]),
      platformPhase: PlatformPhase.Lobby,
      activeGameId: null,
      createdAt: new Date(),
    };

    this.rooms.set(roomCode, room);
    return room;
  }

  /**
   * Adds a player to the given room.
   * Validates name (1–20 chars), checks phase is Lobby,
   * enforces max 10 players, and ensures name uniqueness.
   */
  addPlayer(room: PlatformRoom, playerName: string, socketId: string): PlatformPlayer {
    if (!playerName || playerName.length < 1 || playerName.length > MAX_PLAYER_NAME_LENGTH) {
      throw new Error(
        `Player name must be between 1 and ${MAX_PLAYER_NAME_LENGTH} characters.`
      );
    }

    if (room.platformPhase !== PlatformPhase.Lobby) {
      throw new Error("Cannot join a game that is already in progress.");
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new Error("Room is full. Maximum 10 players allowed.");
    }

    if (!this.isNameUnique(room, playerName)) {
      throw new Error(`The name "${playerName}" is already taken in this room.`);
    }

    const player: PlatformPlayer = {
      id: socketId,
      name: playerName,
      isHost: false,
      isConnected: true,
      disconnectedAt: null,
      color: getNextColor(),
    };

    room.players.set(socketId, player);
    return player;
  }

  /**
   * Removes a player from the room by their socket ID.
   * If the room becomes empty, removes it from the store.
   */
  removePlayer(room: PlatformRoom, playerId: string): void {
    room.players.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(room.roomCode);
    }
  }

  /**
   * Case-sensitive check — returns true only if no current player
   * in the room has the exact same name.
   */
  isNameUnique(room: PlatformRoom, playerName: string): boolean {
    for (const player of room.players.values()) {
      if (player.name === playerName) {
        return false;
      }
    }
    return true;
  }

  /**
   * Promotes the next connected non-host player to host.
   * Sets the previous host's isHost to false.
   * Does nothing if no connected non-host players exist.
   */
  transferHost(room: PlatformRoom): void {
    const currentHost = room.players.get(room.hostId);

    // Find the next connected player that is not the current host
    let nextHost: PlatformPlayer | undefined;
    for (const player of room.players.values()) {
      if (player.id !== room.hostId && player.isConnected) {
        nextHost = player;
        break;
      }
    }

    if (!nextHost) {
      // No connected non-host players — do nothing
      return;
    }

    // Demote current host
    if (currentHost) {
      currentHost.isHost = false;
    }

    // Promote next host
    nextHost.isHost = true;
    room.hostId = nextHost.id;
  }

  /**
   * Returns the room with the given code, or null if not found.
   */
  getRoom(roomCode: string): PlatformRoom | null {
    return this.rooms.get(roomCode) ?? null;
  }
}
