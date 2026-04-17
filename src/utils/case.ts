// =============================================================================
// utils/case.ts
// Key case conversion utilities for normalizeKeys.
//
// Converts any identifier format (camelCase, snake_case, PascalCase,
// kebab-case, SCREAMING_SNAKE, mixed) into the target case.
//
// Design:
//   • Single-function tokenisation reused across all case outputs.
//   • Module-level LRU cache (2000 entries) per target case.
//   • Pure — no side effects.
// =============================================================================

import type { KeyCase } from "../types/structure.types.js";
import { isUnsafeKey } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// LRU cache per target case
// ---------------------------------------------------------------------------

const CASE_CACHE = new Map<string, string>();
const CASE_CACHE_MAX = 2000;

function cacheGet(key: string): string | undefined {
  return CASE_CACHE.get(key);
}

function cacheSet(key: string, value: string): void {
  if (CASE_CACHE.size >= CASE_CACHE_MAX) {
    const firstKey = CASE_CACHE.keys().next().value;
    if (firstKey !== undefined) CASE_CACHE.delete(firstKey);
  }
  CASE_CACHE.set(key, value);
}

/** Clears the case conversion cache. */
export function clearCaseCache(): void {
  CASE_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Tokenisation — same approach as v0.2.0 label engine
// ---------------------------------------------------------------------------

/**
 * Tokenises an identifier into an array of lowercase word strings.
 *
 * Handles: camelCase, PascalCase, snake_case, kebab-case,
 *          SCREAMING_SNAKE, mixed acronyms (userID, XMLParser, API_KEY).
 *
 * @example
 * tokeniseKey("firstName")     // ["first", "name"]
 * tokeniseKey("user_id")       // ["user", "id"]
 * tokeniseKey("API_KEY")       // ["api", "key"]
 * tokeniseKey("XMLParser")     // ["xml", "parser"]
 * tokeniseKey("userID")        // ["user", "id"]
 * tokeniseKey("kebab-case")    // ["kebab", "case"]
 */
export function tokeniseKey(key: string): string[] {
  if (!key) return [];

  // Step 1: replace separators
  let s = key.replace(/[_\-. ]+/g, " ");

  // Step 2: insert space before transitions lowercase→UPPER
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Step 3: insert space between runs of UPPER before trailing lower
  //   XMLParser → XML Parser, getHTTPResponse → get HTTP Response
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Step 4: split numbers from letters
  s = s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
  s = s.replace(/(\d)([a-zA-Z])/g, "$1 $2");

  // Step 5: split and lowercase all tokens
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

// ---------------------------------------------------------------------------
// Case application
// ---------------------------------------------------------------------------

/**
 * Converts an array of lowercase tokens to the target case.
 */
function applyCase(tokens: string[], targetCase: KeyCase): string {
  if (tokens.length === 0) return "";

  switch (targetCase) {
    case "camel":
      return tokens
        .map((t, i) =>
          i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1)
        )
        .join("");

    case "pascal":
      return tokens
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join("");

    case "snake":
      return tokens.join("_");

    case "kebab":
      return tokens.join("-");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a single key into the target case format.
 * Results are cached for repeated calls.
 *
 * Unsafe keys (`__proto__`, `constructor`, `prototype`) are returned unchanged.
 *
 * @example
 * convertKeyCase("firstName", "snake")   // → "first_name"
 * convertKeyCase("user_id",   "camel")   // → "userId"
 * convertKeyCase("UserAge",   "kebab")   // → "user-age"
 * convertKeyCase("API_KEY",   "camel")   // → "apiKey"
 * convertKeyCase("userID",    "snake")   // → "user_id"
 * convertKeyCase("XMLParser", "pascal")  // → "XmlParser"
 */
export function convertKeyCase(key: string, targetCase: KeyCase): string {
  if (!key) return key;
  if (isUnsafeKey(key)) return key; // always pass through unsafe keys unchanged

  const cacheKey = `${key}::${targetCase}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const tokens = tokeniseKey(key);
  const result = applyCase(tokens, targetCase);

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Converts a key using an optional custom map first, then falls back to
 * automatic case conversion.
 *
 * @param key        - The raw source key.
 * @param targetCase - The desired output case.
 * @param customMap  - Optional explicit key overrides (applied first).
 */
export function convertKey(
  key: string,
  targetCase: KeyCase,
  customMap?: Readonly<Record<string, string>>
): string {
  if (isUnsafeKey(key)) return key;

  // Custom map lookup (exact match first, then case-insensitive)
  if (customMap) {
    if (Object.prototype.hasOwnProperty.call(customMap, key)) {
      return customMap[key] as string;
    }
    const lowerKey = key.toLowerCase();
    const mapKey = Object.keys(customMap).find(
      (k) => k.toLowerCase() === lowerKey
    );
    if (mapKey !== undefined) return customMap[mapKey] as string;
  }

  return convertKeyCase(key, targetCase);
}
