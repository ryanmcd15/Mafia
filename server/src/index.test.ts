import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// Smoke test: verifies Vitest and fast-check are installed and importable.
describe("setup smoke tests", () => {
  it("vitest is running", () => {
    expect(true).toBe(true);
  });

  it("fast-check is available and can run a basic property", () => {
    // Feature: mafia-game, Property smoke: numeric identity
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      })
    );
  });
});
