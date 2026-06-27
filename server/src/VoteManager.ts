import { Room, VoteResult } from "./games/mafia/types.js";

/** Sentinel target ID representing a "skip" vote (no elimination) */
export const SKIP_VOTE_TARGET = "__SKIP__";

export class VoteManager {
  /**
   * Records a vote from a living player to eliminate another living player.
   * Validates:
   * - Voter is alive
   * - Target is alive
   * - Voter has not already voted
   * Stores the vote in gameState.votes (voterId -> targetId)
   */
  recordVote(room: Room, voterId: string, targetId: string): void {
    if (!room.gameState) {
      throw new Error("Cannot record vote: game has not started.");
    }

    const voter = room.players.get(voterId);
    if (!voter) {
      throw new Error("Voter not found in this room.");
    }

    if (!voter.isAlive) {
      throw new Error("Dead players cannot vote.");
    }

    const target = room.players.get(targetId);
    if (!target) {
      throw new Error("Vote target not found in this room.");
    }

    if (!target.isAlive) {
      throw new Error("Cannot vote for a player who is not alive.");
    }

    if (this.hasVoted(room, voterId)) {
      throw new Error("You have already voted in this phase.");
    }

    room.gameState.votes.set(voterId, targetId);
  }

  /**
   * Records a skip vote from a living player.
   * A skip vote means the player chooses not to eliminate anyone.
   * Validates:
   * - Voter is alive
   * - Voter has not already voted
   */
  recordSkipVote(room: Room, voterId: string): void {
    if (!room.gameState) {
      throw new Error("Cannot record vote: game has not started.");
    }

    const voter = room.players.get(voterId);
    if (!voter) {
      throw new Error("Voter not found in this room.");
    }

    if (!voter.isAlive) {
      throw new Error("Dead players cannot vote.");
    }

    if (this.hasVoted(room, voterId)) {
      throw new Error("You have already voted in this phase.");
    }

    room.gameState.votes.set(voterId, SKIP_VOTE_TARGET);
  }

  /**
   * Checks if a player has already submitted a vote in the current voting phase.
   * Returns true if the voter's ID exists in gameState.votes, false otherwise.
   */
  hasVoted(room: Room, voterId: string): boolean {
    if (!room.gameState) {
      return false;
    }
    return room.gameState.votes.has(voterId);
  }

  /**
   * Tallies all votes and determines the elimination outcome.
   *
   * Skip vote logic:
   * - If skip votes are a strict majority (>50% of living players), no one is eliminated.
   * - Otherwise, skip votes are ignored and the player with the most non-skip votes
   *   is eliminated (ties still produce no elimination).
   *
   * Returns a VoteResult containing:
   * - eliminatedPlayerId: the player with the most votes (null if tie or skip majority)
   * - voteCounts: map of targetId -> vote count (excludes skip votes)
   * - isTie: true if multiple players tied for most votes
   * - tiedPlayers: array of player IDs with the highest vote count (if tie)
   */
  tallyVotes(room: Room): VoteResult {
    if (!room.gameState) {
      throw new Error("Cannot tally votes: game has not started.");
    }

    // Count living players for majority calculation
    const livingPlayerCount = Array.from(room.players.values()).filter(
      (p) => p.isAlive
    ).length;

    // Separate skip votes from player votes
    let skipVoteCount = 0;
    const voteCounts = new Map<string, number>();

    for (const targetId of room.gameState.votes.values()) {
      if (targetId === SKIP_VOTE_TARGET) {
        skipVoteCount++;
      } else {
        const currentCount = voteCounts.get(targetId) || 0;
        voteCounts.set(targetId, currentCount + 1);
      }
    }

    // If skip votes are a strict majority, no elimination
    if (skipVoteCount > livingPlayerCount / 2) {
      return {
        eliminatedPlayerId: null,
        voteCounts,
        isTie: false,
        tiedPlayers: [],
      };
    }

    // If no non-skip votes were cast, return empty result
    if (voteCounts.size === 0) {
      return {
        eliminatedPlayerId: null,
        voteCounts,
        isTie: false,
        tiedPlayers: [],
      };
    }

    // Find the maximum vote count
    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) {
        maxVotes = count;
      }
    }

    // Find all players with the maximum vote count
    const playersWithMaxVotes: string[] = [];
    for (const [playerId, count] of voteCounts.entries()) {
      if (count === maxVotes) {
        playersWithMaxVotes.push(playerId);
      }
    }

    // Determine if there's a tie
    const isTie = playersWithMaxVotes.length > 1;

    return {
      eliminatedPlayerId: isTie ? null : playersWithMaxVotes[0],
      voteCounts,
      isTie,
      tiedPlayers: isTie ? playersWithMaxVotes : [],
    };
  }

  /**
   * Clears all votes from the current voting phase.
   * Resets gameState.votes to an empty Map.
   */
  clearVotes(room: Room): void {
    if (!room.gameState) {
      throw new Error("Cannot clear votes: game has not started.");
    }
    room.gameState.votes.clear();
  }
}
