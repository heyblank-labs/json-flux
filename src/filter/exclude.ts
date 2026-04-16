// =============================================================================
// filter/exclude.ts
// Removes specified keys (by exact name, dot-notation path, or wildcard pattern)
// from a JSON value.
//
// Design:
//   • Matchers are compiled once before traversal — O(1) per-node lookup.
//   • Single-pass traversal — no repeated deep scans.
//   • Cycle-safe via WeakSet.
//   • Pure — never mutates input.
//   • Tracks removed paths for auditability.
// =============================================================================

import type { ExcludeOptions, FilterResult } from "../types/filter.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches } from "./matcher.js";
import { joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Removes specified keys from a JSON object.
 *
 * Supports:
 *   - Bare key names:        `"password"` (removes at any depth)
 *   - Exact dot paths:       `"user.address.internal"`
 *   - Single wildcards:      `"user.*.secret"`
 *   - Double-star globs:     `"**.password"`
 *   - Array index wildcards: `"users[*].token"`
 *
 * @param obj   - The object to filter.
 * @param keys  - Array of key names, paths, or patterns to remove.
 * @param options - Filter options.
 * @returns A FilterResult containing the filtered data and audit metadata.
 *
 * @example
 * excludeKeys(
 *   { user: { name: "Alice", password: "secret", address: { city: "London", zip: "SW1A 1AA" } } },
 *   ["password", "user.address.zip"]
 * ).data
 * // → { user: { name: "Alice", address: { city: "London" } } }
 *
 * @example
 * excludeKeys(
 *   { user: { token: "abc", profile: { token: "xyz", name: "Bob" } } },
 *   ["**.token"]
 * ).data
 * // → { user: { profile: { name: "Bob" } } }
 *
 * @example
 * excludeKeys(
 *   { users: [{ name: "Alice", ssn: "123" }, { name: "Bob", ssn: "456" }] },
 *   ["users[*].ssn"]
 * ).data
 * // → { users: [{ name: "Alice" }, { name: "Bob" }] }
 */
export function excludeKeys<T = unknown>(
  obj: T,
  keys: readonly string[],
  options: ExcludeOptions = {}
): FilterResult<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const deep = options.deep ?? true;
  const ci = options.caseInsensitive ?? false;
  const matcherOpts = { caseInsensitive: ci };

  // Compile all patterns once
  const matchers = compileMatchers(keys, matcherOpts);

  const removedPaths: string[] = [];
  const ctx = createTraversalContext();

  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return current;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;

        const childPath = joinPath(path, key);

        // Check if this key/path is excluded
        if (
          anyMatcherMatches(matchers, childPath) ||
          anyMatcherMatches(matchers, key)
        ) {
          removedPaths.push(childPath);
          continue; // skip this key
        }

        result[key] = deep ? traverse(value, childPath, depth + 1) : value;
      }

      ctx.unmarkSeen(current);
      return result;
    }

    // ── Array ─────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      return current.map((item, i) =>
        traverse(item, joinPath(path, i), depth + 1)
      );
    }

    return current;
  }

  const data = traverse(obj, "", 0) as T;

  return Object.freeze<FilterResult<T>>({
    data,
    removedCount: removedPaths.length,
    removedPaths: Object.freeze(removedPaths),
  });
}

/**
 * Convenience variant that returns the filtered value directly (no metadata).
 *
 * @example
 * excludeKeysDirect({ user: { name: "Alice", password: "x" } }, ["password"])
 * // → { user: { name: "Alice" } }
 */
export function excludeKeysDirect<T = unknown>(
  obj: T,
  keys: readonly string[],
  options: ExcludeOptions = {}
): T {
  return excludeKeys(obj, keys, options).data;
}
