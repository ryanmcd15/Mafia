// Feature: party-games-platform, Property 28: Timer display format

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatTime } from "./SpyfallGame";

/**
 * **Validates: Requirements 13.3**
 *
 * Property 28: Timer display format (MM:SS zero-padded)
 * The formatTime function must return a string in MM:SS format with
 * correct zero-padding for any non-negative integer seconds input,
 * and must clamp negative values to "00:00".
 */
describe("SpyfallGame - formatTime", () => {
  it("should produce MM:SS zero-padded format with correct values for any seconds 0–999", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (seconds) => {
        const result = formatTime(seconds);

        // Assert format matches MM:SS with exactly 2 digits each
        expect(result).toMatch(/^\d{2}:\d{2}$/);

        // Parse and validate correctness
        const [mmStr, ssStr] = result.split(":");
        const expectedMinutes = Math.floor(seconds / 60);
        const expectedSeconds = seconds % 60;

        expect(parseInt(mmStr, 10)).toBe(expectedMinutes);
        expect(parseInt(ssStr, 10)).toBe(expectedSeconds);

        // Verify zero-padding (always 2 characters)
        expect(mmStr.length).toBe(2);
        expect(ssStr.length).toBe(2);
      }),
      { numRuns: 100 }
    );
  });

  it("should clamp negative values to '00:00'", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: -1 }), (seconds) => {
        const result = formatTime(seconds);
        expect(result).toBe("00:00");
      }),
      { numRuns: 100 }
    );
  });
});
