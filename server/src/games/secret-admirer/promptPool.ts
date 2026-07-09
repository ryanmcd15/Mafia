/**
 * Prompt Pool
 *
 * Loads and manages prompts from a JSON file organized by spice level.
 * Handles validation, random selection without repetition, and fallback
 * logic when a spice level is exhausted.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.6, 13.1, 13.2, 13.3, 13.4
 */

import { readFileSync, existsSync } from "fs";
import type { SpiceLevel } from "./types.js";

/** Structure of the prompts JSON file */
export interface PromptFileData {
  mild: string[];
  medium: string[];
  hot: string[];
  explicit?: string[];
}

/** Result of prompt file validation */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Required spice level keys in the prompt file */
const REQUIRED_KEYS: SpiceLevel[] = ["mild", "medium", "hot"];

/** Minimum number of prompts required per spice level (Req 13.2) */
const MIN_PROMPTS_PER_LEVEL = 100;

/** Maximum character length for a prompt (Req 13.2) */
const MAX_PROMPT_LENGTH = 280;

/**
 * Fallback order when a spice level is exhausted (Req 4.5):
 * Mild → Medium → Hot → Mild (cyclic)
 * Explicit → Hot → Medium → Mild
 */
const FALLBACK_ORDER: Record<SpiceLevel, SpiceLevel[]> = {
  mild: ["medium", "hot"],
  medium: ["hot", "mild"],
  hot: ["mild", "medium"],
  explicit: ["hot", "medium", "mild"],
};

/**
 * Manages prompt loading, validation, and selection with no-repeat guarantees.
 */
export class PromptPool {
  private prompts: PromptFileData | null = null;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Validates the prompt file structure (Req 13.3).
   * Checks: file exists, valid JSON, three required keys, 100+ prompts per level,
   * each prompt is a non-empty string of 1-280 characters.
   */
  validate(): ValidationResult {
    // Check file exists
    if (!existsSync(this.filePath)) {
      return { valid: false, error: `Prompt file not found: ${this.filePath}` };
    }

    // Read and parse JSON
    let rawData: unknown;
    try {
      const fileContent = readFileSync(this.filePath, "utf-8");
      rawData = JSON.parse(fileContent);
    } catch (err) {
      return { valid: false, error: `Invalid JSON in prompt file: ${(err as Error).message}` };
    }

    // Check it's an object
    if (typeof rawData !== "object" || rawData === null || Array.isArray(rawData)) {
      return { valid: false, error: "Prompt file must contain a JSON object" };
    }

    const data = rawData as Record<string, unknown>;

    // Check all three required keys exist
    for (const key of REQUIRED_KEYS) {
      if (!(key in data)) {
        return { valid: false, error: `Missing required key: "${key}"` };
      }
    }

    // Validate each spice level array
    for (const key of REQUIRED_KEYS) {
      const prompts = data[key];

      if (!Array.isArray(prompts)) {
        return { valid: false, error: `Key "${key}" must map to an array` };
      }

      if (prompts.length < MIN_PROMPTS_PER_LEVEL) {
        return {
          valid: false,
          error: `Key "${key}" has ${prompts.length} prompts, requires at least ${MIN_PROMPTS_PER_LEVEL}`,
        };
      }

      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        if (typeof prompt !== "string") {
          return { valid: false, error: `Key "${key}" contains non-string value at index ${i}` };
        }
        if (prompt.length < 1 || prompt.length > MAX_PROMPT_LENGTH) {
          return {
            valid: false,
            error: `Key "${key}" prompt at index ${i} has invalid length ${prompt.length} (must be 1-${MAX_PROMPT_LENGTH})`,
          };
        }
      }
    }

    // All checks passed — store the validated data
    this.prompts = data as unknown as PromptFileData;
    return { valid: true };
  }

  /**
   * Randomly selects a prompt from the given spice level that hasn't been used (Req 4.1, 4.2).
   * Returns null if the level is exhausted.
   */
  getPrompt(spiceLevel: SpiceLevel, usedPrompts: Set<string>): string | null {
    if (!this.prompts) {
      return null;
    }

    const levelPrompts = this.prompts[spiceLevel];
    if (!levelPrompts || levelPrompts.length === 0) {
      return null;
    }

    const available = levelPrompts.filter((p) => !usedPrompts.has(p));
    if (available.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  /**
   * Attempts to find a prompt from fallback spice levels (Req 4.5, 4.6).
   * Fallback order: Mild → Medium → Hot → Mild (cyclic).
   * Returns null if all levels are exhausted.
   */
  getFallbackPrompt(currentLevel: SpiceLevel, usedPrompts: Set<string>): string | null {
    const fallbackLevels = FALLBACK_ORDER[currentLevel];

    for (const level of fallbackLevels) {
      const prompt = this.getPrompt(level, usedPrompts);
      if (prompt !== null) {
        return prompt;
      }
    }

    // All spice levels exhausted (Req 4.6)
    return null;
  }
}
