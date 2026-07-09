/**
 * Admirer Cycle Generator
 *
 * Generates a single Hamiltonian cycle where each player admires exactly one
 * other player and is admired by exactly one player. No self-assignments exist.
 *
 * Algorithm: Fisher-Yates shuffle of player array, then create cycle by assigning
 * each player to the next player in the shuffled array (last wraps to first).
 *
 * Requirements: 3.1, 3.2, 3.3, 14.1, 14.2, 14.3
 */

/**
 * Fisher-Yates (Knuth) shuffle - produces a uniformly random permutation.
 * Mutates the input array in place and returns it.
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generates an Admirer Cycle as a Map where key = admirer, value = target.
 *
 * The cycle is a single Hamiltonian cycle through all players: following the
 * assignments from any player will visit every other player exactly once before
 * returning to the start.
 *
 * @param playerIds - Array of unique player identifiers (minimum 3)
 * @returns Map where each key (admirer) maps to their target (the person they admire)
 * @throws Error if fewer than 3 players are provided
 */
export function generateAdmirerCycle(playerIds: string[]): Map<string, string> {
  if (playerIds.length < 3) {
    throw new Error("Need at least 3 players to generate an admirer cycle");
  }

  // Create a shuffled copy (don't mutate the input)
  const shuffled = fisherYatesShuffle([...playerIds]);

  // Build the cycle: each player admires the next player in the shuffled order
  // Last player admires the first, completing the cycle
  const cycle = new Map<string, string>();
  for (let i = 0; i < shuffled.length; i++) {
    const admirer = shuffled[i];
    const target = shuffled[(i + 1) % shuffled.length];
    cycle.set(admirer, target);
  }

  return cycle;
}

/**
 * Serialized representation of a cycle for storage/transmission.
 */
export interface SerializedCycle {
  assignments: Array<{ admirer: string; target: string }>;
}

/**
 * Serializes a cycle Map to a plain object suitable for JSON storage.
 *
 * @param cycle - The admirer→target Map to serialize
 * @returns A plain object with an assignments array
 */
export function serializeCycle(cycle: Map<string, string>): SerializedCycle {
  const assignments: Array<{ admirer: string; target: string }> = [];
  for (const [admirer, target] of cycle) {
    assignments.push({ admirer, target });
  }
  return { assignments };
}

/**
 * Deserializes a plain object back into a cycle Map.
 *
 * @param data - The serialized cycle object (as produced by serializeCycle)
 * @returns The reconstructed admirer→target Map
 */
export function deserializeCycle(data: object): Map<string, string> {
  const serialized = data as SerializedCycle;
  const cycle = new Map<string, string>();
  for (const { admirer, target } of serialized.assignments) {
    cycle.set(admirer, target);
  }
  return cycle;
}
