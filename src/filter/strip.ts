// =============================================================================
// filter/strip.ts
// Removes "empty" values from a JSON structure with fine-grained control
// over what counts as empty.
//
// More configurable than removeNulls (v0.1.0):
//   • Explicit preserve flags for false, 0, empty strings
//   • Removes empty arrays and empty objects by default (unlike removeNulls)
//   • Tracks removed paths for auditability
//   • Cycle-safe, pure, immutable
// =============================================================================

import type { StripEmptyOptions, FilterResult } from "../types/filter.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const STRIP_DEFAULTS: Required<StripEmptyOptions> = {
  maxDepth: DEFAULT_MAX_DEPTH,
  deep: true,
  preserveFalse: true,
  preserveZero: true,
  preserveEmptyStrings: false,
  preserveEmptyArrays: false,
  preserveEmptyObjects: false,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recursively removes "empty" values from a JSON structure.
 *
 * By default removes: null, undefined, "", [], {}
 * By default keeps:   false, 0 (configurable)
 *
 * @param obj     - The value to strip.
 * @param options - Fine-grained control over what is considered empty.
 * @returns A FilterResult with the stripped data and audit metadata.
 *
 * @example
 * stripEmpty({
 *   name: "Alice",
 *   age: null,
 *   score: 0,
 *   active: false,
 *   tags: [],
 *   address: {},
 *   bio: "",
 * }).data
 * // → { name: "Alice", score: 0, active: false }
 * // null, [], {}, "" removed; 0 and false preserved (default)
 *
 * @example
 * // Also remove 0 and false
 * stripEmpty(obj, { preserveZero: false, preserveFalse: false }).data
 *
 * @example
 * // Keep empty arrays
 * stripEmpty(obj, { preserveEmptyArrays: true }).data
 */
export function stripEmpty<T = unknown>(
  obj: T,
  options: StripEmptyOptions = {}
): FilterResult<T> {
  const opts: Required<StripEmptyOptions> = { ...STRIP_DEFAULTS, ...options };
  const removedPaths: string[] = [];
  const ctx = createTraversalContext();

  function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (value === false && !opts.preserveFalse) return true;
    if (value === 0 && !opts.preserveZero) return true;
    if (value === "" && !opts.preserveEmptyStrings) return true;
    if (Array.isArray(value) && value.length === 0 && !opts.preserveEmptyArrays)
      return true;
    if (
      isPlainObject(value) &&
      Object.keys(value as object).length === 0 &&
      !opts.preserveEmptyObjects
    )
      return true;
    return false;
  }

  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > opts.maxDepth) return current;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;

        const childPath = joinPath(path, key);

        if (isEmpty(value)) {
          removedPaths.push(childPath);
          continue;
        }

        const processed = opts.deep ? traverse(value, childPath, depth + 1) : value;

        // After recursion check if nested result became empty
        if (isEmpty(processed)) {
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

        if (isEmpty(item)) {
          removedPaths.push(itemPath);
          continue;
        }

        const processed = opts.deep ? traverse(item, itemPath, depth + 1) : item;

        if (isEmpty(processed)) {
          removedPaths.push(itemPath);
          continue;
        }

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
 * Convenience variant that returns the stripped value directly (no metadata).
 *
 * @example
 * stripEmptyDirect({ name: "Alice", score: null, tags: [] })
 * // → { name: "Alice" }
 */
export function stripEmptyDirect<T = unknown>(
  obj: T,
  options: StripEmptyOptions = {}
): T {
  return stripEmpty(obj, options).data;
}
