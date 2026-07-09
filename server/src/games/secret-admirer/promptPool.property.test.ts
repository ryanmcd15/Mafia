/**
 * Property tests for Prompt Pool data validation.
 *
 * **Feature: secret-admirer, Property 23: Prompt pool data validation**
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fc from "fast-check";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PromptPool } from "./promptPool.js";
import type { SpiceLevel } from "./types.js";

// ─── Constants ──────────────────────────────────────────────────────

const SPICE_LEVELS: SpiceLevel[] = ["mild", "medium", "hot"];
const MIN_PROMPTS = 100;
const MAX_PROMPT_LENGTH = 280;

// ─── Test Directory ─────────────────────────────────────────────────

const tempDir = join(tmpdir(), "prompt-pool-property-test-" + Date.now());
mkdirSync(tempDir, { recursive: true });

let fileCounter = 0;
const createdFiles: string[] = [];

function nextFilePath(): string {
  const path = join(tempDir, `prompts-${fileCounter++}.json`);
  createdFiles.push(path);
  return path;
}

afterEach(() => {
  for (const f of createdFiles) {
    try { unlinkSync(f); } catch {}
  }
  createdFiles.length = 0;
});

// ─── Arbitraries ────────────────────────────────────────────────────

/** Generates a valid prompt string (1-280 characters). */
const arbValidPrompt = fc.string({ minLength: 1, maxLength: MAX_PROMPT_LENGTH });

/** Generates a valid array of prompts for one spice level (100+ prompts). */
const arbValidPromptArray = fc.integer({ min: MIN_PROMPTS, max: 150 }).chain((count) =>
  fc.array(arbValidPrompt, { minLength: count, maxLength: count })
);

/** Generates a fully valid prompt pool data structure. */
const arbValidPromptPool = fc.record({
  mild: arbValidPromptArray,
  medium: arbValidPromptArray,
  hot: arbValidPromptArray,
});

/** Generates a prompt count that is too low (0-99). */
const arbTooFewCount = fc.integer({ min: 0, max: MIN_PROMPTS - 1 });

/** Generates an invalid prompt: either empty or exceeding 280 chars. */
const arbInvalidPrompt = fc.oneof(
  fc.constant(""),
  fc.string({ minLength: MAX_PROMPT_LENGTH + 1, maxLength: MAX_PROMPT_LENGTH + 50 })
);

/** Picks one spice level at random. */
const arbSpiceLevel = fc.constantFrom<SpiceLevel>("mild", "medium", "hot");

// ─── Property 23: Prompt pool data validation ───────────────────────

describe("Property 23: Prompt pool data validation", () => {
  /**
   * **Validates: Requirements 13.2**
   *
   * For every prompt in the prompt pool JSON file, its character length
   * SHALL be between 1 and 280, and each spice level category ("mild",
   * "medium", "hot") SHALL contain at least 100 prompts.
   */
  it("validate() accepts prompt pools where each level has 100+ prompts of 1-280 chars", () => {
    fc.assert(
      fc.property(arbValidPromptPool, (data) => {
        const filePath = nextFilePath();
        writeFileSync(filePath, JSON.stringify(data), "utf-8");

        const pool = new PromptPool(filePath);
        const result = pool.validate();

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("validate() rejects prompt pools where any level has fewer than 100 prompts", () => {
    fc.assert(
      fc.property(
        arbTooFewCount,
        arbSpiceLevel,
        arbValidPromptArray,
        arbValidPromptArray,
        (tooFewCount, targetLevel, validArray1, validArray2) => {
          // Build a pool with one level having too few prompts
          const tooFewPrompts = Array.from(
            { length: tooFewCount },
            (_, i) => `prompt ${i + 1}`
          );

          const levels: SpiceLevel[] = ["mild", "medium", "hot"];
          const otherLevels = levels.filter((l) => l !== targetLevel);

          const data: Record<string, string[]> = {
            [targetLevel]: tooFewPrompts,
            [otherLevels[0]]: validArray1,
            [otherLevels[1]]: validArray2,
          };

          const filePath = nextFilePath();
          writeFileSync(filePath, JSON.stringify(data), "utf-8");

          const pool = new PromptPool(filePath);
          const result = pool.validate();

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validate() rejects prompt pools where any prompt is empty or exceeds 280 chars", () => {
    fc.assert(
      fc.property(
        arbInvalidPrompt,
        arbSpiceLevel,
        fc.integer({ min: 0, max: 99 }),
        (invalidPrompt, targetLevel, insertIndex) => {
          // Build a valid pool, then inject one invalid prompt
          const buildValidArray = (prefix: string) =>
            Array.from({ length: MIN_PROMPTS }, (_, i) => `${prefix} prompt ${i + 1}`);

          const data: Record<string, string[]> = {
            mild: buildValidArray("Mild"),
            medium: buildValidArray("Medium"),
            hot: buildValidArray("Hot"),
          };

          // Insert the invalid prompt at a valid index
          const targetArray = data[targetLevel];
          const idx = insertIndex % targetArray.length;
          targetArray[idx] = invalidPrompt;

          const filePath = nextFilePath();
          writeFileSync(filePath, JSON.stringify(data), "utf-8");

          const pool = new PromptPool(filePath);
          const result = pool.validate();

          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
