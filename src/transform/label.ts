// =============================================================================
// transform/label.ts
// Converts raw JSON keys into human-readable display labels.
//
// Resolution order:
//   1. User-supplied `labels` / `dictionary` map   (exact key match, case-insensitive)
//   2. Built-in abbreviation dictionary            (lowercase key match)
//   3. Auto-tokenise → apply case style
//
// Features:
//   • camelCase, PascalCase, snake_case, kebab-case, SCREAMING_SNAKE
//   • Acronym preservation: userID → "User ID", not "User Id"
//   • Memoised per unique (key + serialised options) to avoid re-processing
//   • Pure — zero side effects
// =============================================================================

import type { LabelOptions, CaseStyle } from "../types/section.types.js";
import { isUnsafeKey } from "../core/traversal.js";
import { lookupDictionary } from "../utils/dictionary.js";
import {
  tokenize,
  toTitleCase,
  toSentenceCase,
  mergeAcronymTokens,
  looksLikeAcronym,
  unescapeKey,
  lastSegment,
} from "../utils/string.js";

// ---------------------------------------------------------------------------
// Internal memo cache
// ---------------------------------------------------------------------------

/**
 * Module-level LRU-style cache.
 * Key: `rawKey|caseStyle|preserveAcronyms|dictHash`
 * We cap at 2000 entries to prevent unbounded growth in long-running servers.
 */
const LABEL_CACHE = new Map<string, string>();
const LABEL_CACHE_MAX = 2000;

type ResolvedLabelOptions = {
  caseStyle: CaseStyle;
  preserveAcronyms: boolean;
  dictionary: Readonly<Record<string, string>> | undefined;
  delimiter: string;
};

function getCacheKey(key: string, opts: ResolvedLabelOptions): string {
  const dictStr = opts.dictionary
    ? Object.keys(opts.dictionary).sort().join(",")
    : "";
  return `${key}|${opts.caseStyle}|${opts.preserveAcronyms ? "1" : "0"}|${dictStr}`;
}

function cacheSet(k: string, v: string): void {
  if (LABEL_CACHE.size >= LABEL_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order)
    const firstKey = LABEL_CACHE.keys().next().value;
    if (firstKey !== undefined) LABEL_CACHE.delete(firstKey);
  }
  LABEL_CACHE.set(k, v);
}

/**
 * Clears the internal label cache.
 * Useful in tests or when switching label configs at runtime.
 */
export function clearLabelCache(): void {
  LABEL_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULT_LABEL_OPTIONS: {
  caseStyle: CaseStyle;
  preserveAcronyms: boolean;
  dictionary: Readonly<Record<string, string>> | undefined;
  delimiter: string;
} = {
  caseStyle: "title",
  preserveAcronyms: true,
  dictionary: undefined,
  delimiter: ".",
};

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Converts a raw JSON key (or dot-notation path) into a human-readable label.
 *
 * @param key      - The raw key or dot-notation path, e.g. `"user.firstName"`.
 * @param options  - Label generation options.
 * @returns A human-readable label string.
 *
 * @example
 * toDisplayLabel("firstName")              // → "First Name"
 * toDisplayLabel("user_id")               // → "User ID"
 * toDisplayLabel("dob")                   // → "Date of Birth"
 * toDisplayLabel("XMLParser")             // → "XML Parser"
 * toDisplayLabel("user.address.city")     // → "City"
 * toDisplayLabel("firstName", {
 *   dictionary: { firstName: "Given Name" }
 * })                                      // → "Given Name"
 * toDisplayLabel("status", { caseStyle: "sentence" }) // → "Status"
 */
export function toDisplayLabel(key: string, options: LabelOptions = {}): string {
  if (!key) return "";

  const opts: ResolvedLabelOptions = {
    caseStyle: options.caseStyle ?? DEFAULT_LABEL_OPTIONS.caseStyle,
    preserveAcronyms: options.preserveAcronyms ?? DEFAULT_LABEL_OPTIONS.preserveAcronyms,
    dictionary: options.dictionary ?? DEFAULT_LABEL_OPTIONS.dictionary,
    delimiter: options.delimiter ?? DEFAULT_LABEL_OPTIONS.delimiter,
  };

  // Security: never process unsafe prototype keys
  if (isUnsafeKey(key)) return "";

  // For dot-notation paths, work only on the last segment
  const segment = key.includes(opts.delimiter)
    ? lastSegment(key, opts.delimiter)
    : key;

  // Unescape bracket-wrapped keys from the flatten layer: "[a.b]" → "a.b"
  const bare = unescapeKey(segment);

  // Check cache
  const cacheKey = getCacheKey(bare, opts);
  const cached = LABEL_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  // 1. User dictionary / built-in dictionary lookup
  const dictMatch = lookupDictionary(bare, opts.dictionary);
  if (dictMatch !== undefined) {
    cacheSet(cacheKey, dictMatch);
    return dictMatch;
  }

  // 2. Tokenise the bare key
  let tokens = tokenize(bare);

  // 3. Merge stray single-char uppercase sequences into acronyms
  tokens = mergeAcronymTokens(tokens);

  // 4. Apply per-token dictionary lookup — resolves "id" → "ID", "api" → "API"
  //    only for tokens that are not already all-caps (genuine acronyms)
  tokens = tokens.map((t) => {
    const dictHit = lookupDictionary(t, opts.dictionary);
    // Only substitute if it's a single-word expansion (no spaces), keeps tokens clean
    if (dictHit !== undefined && !dictHit.includes(" ")) return dictHit;
    return t;
  });

  // 5. Handle acronym preservation
  if (!opts.preserveAcronyms) {
    // Lowercase all-caps tokens so they get title-cased normally
    tokens = tokens.map((t) =>
      looksLikeAcronym(t) ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t
    );
  }

  // 6. Build a fast set of tokens that are dictionary-confirmed acronyms
  //    (used by toTitleCase/toSentenceCase to preserve 4+ char all-caps)
  const knownAcronymSet = new Set(
    tokens.filter((t) => {
      const hit = lookupDictionary(t, opts.dictionary);
      return hit !== undefined && hit === t; // dict returns the token itself (e.g. "HTTP" → "HTTP")
    })
  );
  const isKnownAcronym = (t: string): boolean => knownAcronymSet.has(t);

  // 7. Apply case style
  const label: string =
    opts.caseStyle === "sentence"
      ? toSentenceCase(tokens, isKnownAcronym)
      : toTitleCase(tokens, isKnownAcronym);

  cacheSet(cacheKey, label);
  return label;
}

/**
 * Converts a map of raw keys to their human-readable labels.
 * Useful for building column header maps for table components.
 *
 * @param keys    - Array of raw keys to label.
 * @param options - Label options applied to all keys.
 * @returns A frozen record of `rawKey → label`.
 *
 * @example
 * labelKeys(["firstName", "user_id", "dob"])
 * // → { firstName: "First Name", user_id: "User ID", dob: "Date of Birth" }
 */
export function labelKeys(
  keys: readonly string[],
  options: LabelOptions = {}
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = toDisplayLabel(key, options);
  }
  return Object.freeze(result);
}
