// =============================================================================
// structure/normalizeKeys.ts
// Normalizes all object keys into a consistent case format across the entire tree.
//
// Supported target formats: camelCase, snake_case, PascalCase, kebab-case
//
// Design:
//   • Single-pass depth-first traversal.
//   • Key conversion cached via utils/case.ts (2000-entry LRU).
//   • Handles mixed formats automatically via tokenisation.
//   • Prototype-pollution safe — UNSAFE_KEYS silently skipped.
//   • Pure — never mutates input.
// =============================================================================

import type { NormalizeKeysOptions } from "../types/structure.types.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { convertKey } from "../utils/case.js";

const DEFAULT_OPTIONS: Required<NormalizeKeysOptions> = {
  case: "camel",
  deep: true,
  preserveAcronyms: false,
  customMap: {},
  maxDepth: DEFAULT_MAX_DEPTH,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recursively normalizes all keys in a JSON object to a consistent case format.
 *
 * @param obj     - The object whose keys should be normalised.
 * @param options - Normalisation options.
 * @returns A new object with all keys converted to the target case.
 *
 * @example
 * normalizeKeys(
 *   { firstName: "Alice", last_name: "Smith", UserAge: 30 },
 *   { case: "snake" }
 * )
 * // → { first_name: "Alice", last_name: "Smith", user_age: 30 }
 *
 * @example
 * normalizeKeys(
 *   { first_name: "Alice", "last-name": "Smith", UserAge: 30 },
 *   { case: "camel" }
 * )
 * // → { firstName: "Alice", lastName: "Smith", userAge: 30 }
 *
 * @example
 * normalizeKeys(
 *   { user: { API_KEY: "abc", user_name: "Alice" } },
 *   { case: "camel", deep: true }
 * )
 * // → { user: { apiKey: "abc", userName: "Alice" } }
 *
 * @example
 * // Custom map overrides
 * normalizeKeys(
 *   { user_id: 1, name: "Alice" },
 *   { case: "camel", customMap: { user_id: "userId" } }
 * )
 * // → { userId: 1, name: "Alice" }
 *
 * @example
 * // PascalCase
 * normalizeKeys({ first_name: "Alice" }, { case: "pascal" })
 * // → { FirstName: "Alice" }
 *
 * @example
 * // kebab-case
 * normalizeKeys({ firstName: "Alice" }, { case: "kebab" })
 * // → { "first-name": "Alice" }
 */
export function normalizeKeys<T = unknown>(
  obj: T,
  options: NormalizeKeysOptions = {}
): T {
  const opts: Required<NormalizeKeysOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    customMap: options.customMap ?? {},
  };

  const ctx = createTraversalContext();

  function traverse(current: unknown, depth: number): unknown {
    if (depth > opts.maxDepth) return current;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue; // drop unsafe keys

        const newKey = convertKey(key, opts.case, opts.customMap);

        // Safety: converted key must not be unsafe
        if (isUnsafeKey(newKey)) continue;

        result[newKey] = opts.deep ? traverse(value, depth + 1) : value;
      }

      ctx.unmarkSeen(current);
      return result;
    }

    // ── Array ─────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      return current.map((item) => traverse(item, depth + 1));
    }

    return current;
  }

  return traverse(obj, 0) as T;
}
