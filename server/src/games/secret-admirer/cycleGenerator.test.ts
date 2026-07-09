/**
 * Property tests for Admirer Cycle generation.
 *
 * **Feature: secret-admirer, Property 1: Admirer Cycle structural invariants**
 * **Feature: secret-admirer, Property 2: Admirer Cycle serialization round-trip**
 * **Feature: secret-admirer, Property 3: Admirer Cycle randomness**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  generateAdmirerCycle,
  serializeCycle,
  deserializeCycle,
} from "./cycleGenerator.js";

// ─── Arbitraries ────────────────────────────────────────────────────

/** Generates an array of 3–20 unique non-empty player ID strings. */
const arbPlayerIds = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
    minLength: 3,
    maxLength: 20,
  })
  .filter((arr) => arr.length >= 3);

// ─── Property 1: Admirer Cycle structural invariants ────────────────

describe("Property 1: Admirer Cycle structural invariants", () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 14.2**
   *
   * For any set of 3 to 20 unique player identifiers, the generated
   * Admirer_Cycle SHALL have exactly N assignments (where N is the number
   * of players), every player appears exactly once as a source (admirer),
   * every player appears exactly once as a target (admired), no player is
   * assigned to themselves, and following the assignments from any player
   * eventually visits all players exactly once before returning to the
   * start (single cycle, no sub-cycles).
   */
  it("generateAdmirerCycle produces a valid single Hamiltonian cycle", () => {
    fc.assert(
      fc.property(arbPlayerIds, (playerIds) => {
        const cycle = generateAdmirerCycle(playerIds);
        const n = playerIds.length;

        // 1. Exactly N assignments (map size equals number of players)
        expect(cycle.size).toBe(n);

        // 2. Every player appears exactly once as a key (source/admirer)
        for (const playerId of playerIds) {
          expect(cycle.has(playerId)).toBe(true);
        }

        // 3. Every player appears exactly once as a value (target/admired)
        const values = [...cycle.values()];
        const valueSet = new Set(values);
        expect(valueSet.size).toBe(n);
        for (const playerId of playerIds) {
          expect(valueSet.has(playerId)).toBe(true);
        }

        // 4. No self-assignments (no key equals its value)
        for (const [admirer, target] of cycle) {
          expect(admirer).not.toBe(target);
        }

        // 5. Single Hamiltonian cycle: following assignments from any player
        //    visits all others exactly once before returning to start
        const start = playerIds[0];
        let current = start;
        const visited = new Set<string>();

        for (let step = 0; step < n; step++) {
          current = cycle.get(current)!;
          expect(current).toBeDefined();
          expect(visited.has(current)).toBe(false);
          visited.add(current);
        }

        // After N steps we should be back at start
        expect(current).toBe(start);
        // We visited all N players exactly once
        expect(visited.size).toBe(n);
      }),
      { numRuns: 100 }
    );
  });
});


// ─── Property 2: Admirer Cycle serialization round-trip ─────────────

describe("Property 2: Admirer Cycle serialization round-trip", () => {
  /**
   * **Validates: Requirements 14.1**
   *
   * For any set of 3 to 20 unique player identifiers, generating an
   * Admirer_Cycle, serializing it to an assignment map (admirer → target),
   * and reconstructing the cycle from that map SHALL produce an equivalent
   * cycle (same set of admirer→target pairs).
   */
  it("generateAdmirerCycle → serializeCycle → deserializeCycle produces identical entries", () => {
    fc.assert(
      fc.property(arbPlayerIds, (playerIds) => {
        // Generate a cycle
        const cycle = generateAdmirerCycle(playerIds);

        // Serialize then deserialize
        const serialized = serializeCycle(cycle);
        const reconstructed = deserializeCycle(serialized);

        // The reconstructed map should have the same size
        expect(reconstructed.size).toBe(cycle.size);

        // Every entry in the original cycle should exist in the reconstructed one
        for (const [admirer, target] of cycle) {
          expect(reconstructed.has(admirer)).toBe(true);
          expect(reconstructed.get(admirer)).toBe(target);
        }

        // Every entry in the reconstructed should exist in the original
        for (const [admirer, target] of reconstructed) {
          expect(cycle.has(admirer)).toBe(true);
          expect(cycle.get(admirer)).toBe(target);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Admirer Cycle randomness ───────────────────────────

describe("Property 3: Admirer Cycle randomness", () => {
  /**
   * **Validates: Requirements 14.3**
   *
   * For any set of 3 to 20 unique player identifiers, generating 10
   * Admirer_Cycles with distinct random seeds SHALL produce at least 2
   * distinct permutations (cycles that differ in at least one assignment).
   */
  it("generating 10 cycles with the same player set produces at least 2 distinct permutations", () => {
    fc.assert(
      fc.property(arbPlayerIds, (playerIds) => {
        // Generate 10 cycles with the same player set
        const cycleRepresentations: string[] = [];
        for (let i = 0; i < 10; i++) {
          const cycle = generateAdmirerCycle(playerIds);
          // Convert Map entries to sorted string representation for comparison
          const entries = Array.from(cycle.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}->${v}`)
            .join("|");
          cycleRepresentations.push(entries);
        }

        // Verify at least 2 distinct permutations exist
        const distinctCycles = new Set(cycleRepresentations);
        expect(distinctCycles.size).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 }
    );
  });
});
