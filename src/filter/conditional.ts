// =============================================================================
// filter/conditional.ts
// Conditionally removes fields based on a user-supplied predicate function.
//
// Design:
//   • Predicate receives (value, key, path) — full context for decisions.
//   • Removes empty parent objects after child removal when configured.
//   • Cycle-safe, pure, immutable output.
//   • Composable: can chain with excludeKeys / includeKeys.
// =============================================================================

import type { HideIfOptions, FilterPredicate, FilterResult } from "../types/filter.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Built-in predicates (exported as named constants for convenience)
// ---------------------------------------------------------------------------

/** Removes fields where value is null. */
export const isNull: FilterPredicate = (value) => value === null;

/** Removes fields where value is null or undefined. */
export const isNullish: FilterPredicate = (value) =>
  value === null || value === undefined;

/** Removes fields where value is an empty string. */
export const isEmptyString: FilterPredicate = (value) => value === "";

/** Removes fields where value is an empty array. */
export const isEmptyArray: FilterPredicate = (value) =>
  Array.isArray(value) && value.length === 0;

/** Removes fields where value is an empty plain object. */
export const isEmptyObject: FilterPredicate = (value) =>
  isPlainObject(value) && Object.keys(value as object).length === 0;

/** Removes fields that are falsy (null, undefined, false, 0, ""). */
export const isFalsy: FilterPredicate = (value) => !value;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Conditionally removes fields from a JSON object based on a predicate function.
 *
 * The predicate receives `(value, key, path)` and should return:
 *   - `true`  → remove this field
 *   - `false` → keep this field
 *
 * @param obj       - The object to filter.
 * @param predicate - Function deciding whether to remove each field.
 * @param options   - Filter options.
 * @returns A FilterResult with filtered data and audit metadata.
 *
 * @example
 * // Remove all null values
 * hideIf(obj, (value) => value === null)
 *
 * @example
 * // Remove fields where value is 0 or negative
 * hideIf(obj, (value) => typeof value === "number" && value <= 0)
 *
 * @example
 * // Remove fields in the "internal" subtree
 * hideIf(obj, (_value, _key, path) => path.startsWith("internal."))
 *
 * @example
 * // Remove fields whose key starts with underscore (convention for private)
 * hideIf(obj, (_value, key) => key.startsWith("_"))
 *
 * @example
 * // Remove empty arrays specifically
 * hideIf(obj, (value) => Array.isArray(value) && value.length === 0)
 */
export function hideIf<T = unknown>(
  obj: T,
  predicate: FilterPredicate,
  options: HideIfOptions = {}
): FilterResult<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const deep = options.deep ?? true;
  const removeEmptyParents = options.removeEmptyParents ?? true;

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

        // Apply predicate to the current value (before recursing)
        if (predicate(value as JsonValue, key, childPath)) {
          removedPaths.push(childPath);
          continue;
        }

        // Recurse into nested objects/arrays if deep mode is on
        const processed = deep ? traverse(value, childPath, depth + 1) : value;

        // After recursion, if removeEmptyParents is true and the processed
        // result is now an empty object, skip it too
        if (
          removeEmptyParents &&
          isPlainObject(processed) &&
          Object.keys(processed as object).length === 0 &&
          // Only skip if the original was a non-empty object (i.e. children were removed)
          isPlainObject(value) &&
          Object.keys(value as object).length > 0
        ) {
          removedPaths.push(childPath);
          continue;
        }

        result[key] = processed;
      }

      ctx.unmarkSeen(current);
      return result;
    }

    // ── Array ─────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      const result: unknown[] = [];
      for (let i = 0; i < current.length; i++) {
        const item = current[i];
        const itemPath = joinPath(path, i);

        // Apply predicate to each array item
        if (predicate(item as JsonValue, String(i), itemPath)) {
          removedPaths.push(itemPath);
          continue;
        }

        const processed = deep ? traverse(item, itemPath, depth + 1) : item;
        result.push(processed);
      }
      return result;
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
 * hideIfDirect(obj, (value) => value === null)
 */
export function hideIfDirect<T = unknown>(
  obj: T,
  predicate: FilterPredicate,
  options: HideIfOptions = {}
): T {
  return hideIf(obj, predicate, options).data;
}
