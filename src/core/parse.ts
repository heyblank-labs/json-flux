// =============================================================================
// core/parse.ts
// Safely parses JSON strings — including double/triple-serialized values —
// with full prototype-pollution prevention.
//
// Design:
//  • safeParse: unwraps a single value that may be a JSON string (iterative).
//  • deepSafeParse: recursively applies safeParse to every node in a tree.
//  • sanitizeObject: strips unsafe keys after every parse.
//  • Zero crashes on malformed input.
//  • No eval, no dynamic execution.
// =============================================================================

import type { SafeParseOptions } from "../types/index.js";
import {
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "./traversal.js";

const DEFAULT_PARSE_OPTIONS: Required<SafeParseOptions> = {
  maxIterations: 10,
  maxDepth: DEFAULT_MAX_DEPTH,
  throwOnPollution: false,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fast heuristic: does this string look like it could be valid JSON?
 * Avoids the overhead of a try/catch for every plain string.
 */
function looksLikeJson(s: string): boolean {
  if (s.length < 2) return false;
  const first = s[0];
  const last = s[s.length - 1];

  return (
    (first === "{" && last === "}") ||
    (first === "[" && last === "]") ||
    (first === '"' && last === '"') ||
    s === "true" ||
    s === "false" ||
    s === "null" ||
    /^-?\d/.test(first ?? "")
  );
}

/**
 * Walks a parsed object and removes any key that is a prototype-pollution
 * vector. Creates a new object — does not mutate the input.
 *
 * @param obj              - Plain object to sanitize.
 * @param throwOnPollution - If true, throw on detecting an unsafe key.
 */
function sanitizeObject(
  obj: Record<string, unknown>,
  throwOnPollution: boolean
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (isUnsafeKey(key)) {
      if (throwOnPollution) {
        throw new Error(
          `[@heyblank-labs/json-flux] Prototype pollution attempt detected: key "${key}"`
        );
      }
      continue; // silently drop
    }
    result[key] = (obj as Record<string, unknown>)[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Iteratively unwraps a value that may be a stringified JSON string.
 *
 * Handles the "double-serialized" pattern common in enterprise APIs where
 * a response body is `JSON.stringify`-ed one or more extra times.
 *
 * @param value   - Any value. Non-strings are returned as-is.
 * @param options - Parse configuration.
 * @returns The fully parsed value, or the original if parsing is not possible.
 *
 * @example
 * safeParse('"{\\"name\\":\\"Alice\\"}"') // → { name: "Alice" }
 * safeParse(42)                            // → 42
 * safeParse("not json")                    // → "not json"
 * safeParse('{"__proto__":{"x":1}}')       // → {} (pollution dropped)
 */
export function safeParse(
  value: unknown,
  options: SafeParseOptions = {}
): unknown {
  const opts: Required<SafeParseOptions> = {
    ...DEFAULT_PARSE_OPTIONS,
    ...options,
  };

  if (typeof value !== "string") return value;

  let current: unknown = value;
  let iterations = 0;

  while (typeof current === "string" && iterations < opts.maxIterations) {
    const trimmed = current.trim();
    if (!looksLikeJson(trimmed)) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      break; // malformed — stop here, return last good value
    }

    // Sanitize the freshly parsed object
    if (isPlainObject(parsed)) {
      parsed = sanitizeObject(parsed, opts.throwOnPollution);
    }

    current = parsed;
    iterations++;
  }

  return current;
}

/**
 * Recursively applies `safeParse` to every string value within an
 * object/array tree, returning a new fully-parsed structure.
 *
 * @param input   - Any value to deep-parse.
 * @param options - Parse configuration.
 * @returns A new structure with all nested JSON strings parsed.
 *
 * @example
 * deepSafeParse({ user: '{"name":"Alice"}' })
 * // → { user: { name: "Alice" } }
 *
 * @example
 * deepSafeParse('{"a":{"b":"{\\"c\\":3}"}}')
 * // → { a: { b: { c: 3 } } }
 */
export function deepSafeParse(
  input: unknown,
  options: SafeParseOptions = {}
): unknown {
  const opts: Required<SafeParseOptions> = {
    ...DEFAULT_PARSE_OPTIONS,
    ...options,
  };

  function recurse(value: unknown, depth: number): unknown {
    if (depth > opts.maxDepth) return value;

    // First, attempt to unwrap if this is a JSON string
    const parsed = safeParse(value, opts);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => recurse(item, depth + 1));
    }

    if (isPlainObject(parsed)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(parsed)) {
        if (isUnsafeKey(key)) {
          if (opts.throwOnPollution) {
            throw new Error(
              `[@heyblank-labs/json-flux] Prototype pollution attempt detected: key "${key}"`
            );
          }
          continue;
        }
        result[key] = recurse(
          (parsed as Record<string, unknown>)[key],
          depth + 1
        );
      }
      return result;
    }

    return parsed;
  }

  return recurse(input, 0);
}
