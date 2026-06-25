// Feature: mafia-game, Property 27: Discussion timer format is correct

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatTime } from "./DiscussionView";

/**
 * **Validates: Requirements 10.2**
 *
 * Property 27: Discussion timer format is correct
 * The formatTime function must return a string in MM:SS format with
 * correct zero-padding for any input between 0 and 600 seconds.
 */
describe("DiscussionView - formatTime", () => {
  it("should produce MM:SS format with correct values and zero-padding for any seconds 0–600", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600 }), (seconds) => {
        const result = formatTime(seconds);

        // Assert format matches MM:SS with exactly 2 digits each
        expect(result).toMatch(/^\d{2}:\d{2}$/);

        // Parse and validate correctness
        const [mmStr, ssStr] = result.split(":");
        const expectedMinutes = Math.floor(seconds / 60);
        const expectedSeconds = seconds % 60;

        expect(parseInt(mmStr, 10)).toBe(expectedMinutes);
        expect(parseInt(ssStr, 10)).toBe(expectedSeconds);

        // Verify zero-padding
        expect(mmStr.length).toBe(2);
        expect(ssStr.length).toBe(2);
      }),
      { numRuns: 100 }
    );
  });
});
