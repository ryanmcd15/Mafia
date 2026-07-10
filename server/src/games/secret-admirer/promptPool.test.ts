import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PromptPool } from "./promptPool.js";

/** Helper to generate an array of N unique prompts */
function generatePrompts(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} prompt ${i + 1}`);
}

/** Helper to create a valid prompt file */
function createValidPromptFile(path: string, countsPerLevel = 10) {
  const data = {
    mild: generatePrompts(countsPerLevel, "Mild"),
    medium: generatePrompts(countsPerLevel, "Medium"),
    hot: generatePrompts(countsPerLevel, "Hot"),
  };
  writeFileSync(path, JSON.stringify(data), "utf-8");
}

describe("PromptPool", () => {
  const tempDir = join(tmpdir(), "prompt-pool-test-" + Date.now());
  const validPath = join(tempDir, "valid-prompts.json");
  const missingPath = join(tempDir, "nonexistent.json");

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });
    createValidPromptFile(validPath);
  });

  afterAll(() => {
    try {
      unlinkSync(validPath);
    } catch {}
  });

  describe("validate()", () => {
    it("should return valid for a correct prompt file", () => {
      const pool = new PromptPool(validPath);
      const result = pool.validate();
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should fail when file does not exist", () => {
      const pool = new PromptPool(missingPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should fail for invalid JSON", () => {
      const badPath = join(tempDir, "bad.json");
      writeFileSync(badPath, "not valid json {{{", "utf-8");
      const pool = new PromptPool(badPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid JSON");
      unlinkSync(badPath);
    });

    it("should fail when a required key is missing", () => {
      const noHotPath = join(tempDir, "no-hot.json");
      writeFileSync(
        noHotPath,
        JSON.stringify({
          mild: generatePrompts(10, "Mild"),
          medium: generatePrompts(10, "Medium"),
        }),
        "utf-8"
      );
      const pool = new PromptPool(noHotPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required key: "hot"');
      unlinkSync(noHotPath);
    });

    it("should fail when a key has fewer than 10 prompts", () => {
      const tooFewPath = join(tempDir, "too-few.json");
      writeFileSync(
        tooFewPath,
        JSON.stringify({
          mild: generatePrompts(10, "Mild"),
          medium: generatePrompts(5, "Medium"),
          hot: generatePrompts(10, "Hot"),
        }),
        "utf-8"
      );
      const pool = new PromptPool(tooFewPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('"medium" has 5 prompts');
      unlinkSync(tooFewPath);
    });

    it("should fail when a prompt exceeds 280 characters", () => {
      const longPath = join(tempDir, "long-prompt.json");
      const longPrompt = "x".repeat(281);
      const prompts = generatePrompts(9, "Mild");
      prompts.push(longPrompt);
      writeFileSync(
        longPath,
        JSON.stringify({
          mild: prompts,
          medium: generatePrompts(10, "Medium"),
          hot: generatePrompts(10, "Hot"),
        }),
        "utf-8"
      );
      const pool = new PromptPool(longPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid length 281");
      unlinkSync(longPath);
    });

    it("should fail when a prompt is an empty string", () => {
      const emptyPath = join(tempDir, "empty-prompt.json");
      const prompts = generatePrompts(9, "Hot");
      prompts.push("");
      writeFileSync(
        emptyPath,
        JSON.stringify({
          mild: generatePrompts(10, "Mild"),
          medium: generatePrompts(10, "Medium"),
          hot: prompts,
        }),
        "utf-8"
      );
      const pool = new PromptPool(emptyPath);
      const result = pool.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid length 0");
      unlinkSync(emptyPath);
    });
  });

  describe("getPrompt()", () => {
    it("should return a prompt from the specified spice level", () => {
      const pool = new PromptPool(validPath);
      pool.validate();
      const prompt = pool.getPrompt("mild", new Set());
      expect(prompt).not.toBeNull();
      expect(prompt!).toContain("Mild");
    });

    it("should not return a prompt that has already been used", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      // Use all mild prompts except one
      const usedPrompts = new Set(generatePrompts(9, "Mild"));
      const prompt = pool.getPrompt("mild", usedPrompts);
      expect(prompt).not.toBeNull();
      expect(usedPrompts.has(prompt!)).toBe(false);
    });

    it("should return null when all prompts of the level are used", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      const usedPrompts = new Set(generatePrompts(10, "Mild"));
      const prompt = pool.getPrompt("mild", usedPrompts);
      expect(prompt).toBeNull();
    });

    it("should return null when prompts have not been loaded", () => {
      const pool = new PromptPool(validPath);
      // Skip validate() — prompts not loaded
      const prompt = pool.getPrompt("mild", new Set());
      expect(prompt).toBeNull();
    });
  });

  describe("getFallbackPrompt()", () => {
    it("should try medium then hot when mild is exhausted", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      // Exhaust mild — fallback should come from medium
      const usedPrompts = new Set(generatePrompts(10, "Mild"));
      const prompt = pool.getFallbackPrompt("mild", usedPrompts);
      expect(prompt).not.toBeNull();
      expect(prompt!).toContain("Medium");
    });

    it("should try hot then mild when medium is exhausted", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      const usedPrompts = new Set(generatePrompts(10, "Medium"));
      const prompt = pool.getFallbackPrompt("medium", usedPrompts);
      expect(prompt).not.toBeNull();
      expect(prompt!).toContain("Hot");
    });

    it("should try mild then medium when hot is exhausted", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      const usedPrompts = new Set(generatePrompts(10, "Hot"));
      const prompt = pool.getFallbackPrompt("hot", usedPrompts);
      expect(prompt).not.toBeNull();
      expect(prompt!).toContain("Mild");
    });

    it("should skip to the next fallback if the first fallback is also exhausted", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      // Exhaust both mild and medium — fallback from mild should try medium (empty) then hot
      const usedPrompts = new Set([
        ...generatePrompts(10, "Mild"),
        ...generatePrompts(10, "Medium"),
      ]);
      const prompt = pool.getFallbackPrompt("mild", usedPrompts);
      expect(prompt).not.toBeNull();
      expect(prompt!).toContain("Hot");
    });

    it("should return null when all spice levels are exhausted", () => {
      const pool = new PromptPool(validPath);
      pool.validate();

      const usedPrompts = new Set([
        ...generatePrompts(10, "Mild"),
        ...generatePrompts(10, "Medium"),
        ...generatePrompts(10, "Hot"),
      ]);
      const prompt = pool.getFallbackPrompt("mild", usedPrompts);
      expect(prompt).toBeNull();
    });
  });
});
