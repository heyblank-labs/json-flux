// =============================================================================
// core/clean.ts
// Recursively removes null, undefined, empty strings, and optionally
// empty arrays and empty objects from any JSON-compatible value.
//
// Design:
//  • Pure — returns a new structure, never mutates input.
//  • Cycle-safe via TraversalContext (WeakSet).
//  • Configurable via RemoveNullsOptions.
//  • Prototype-pollution keys are dropped.
// =============================================================================

import type { RemoveNullsOptions } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "./traversal.js";

const DEFAULT_OPTIONS: Required<RemoveNullsOptions> = {
  removeEmptyStrings: true,
  removeEmptyArrays: false,
  removeEmptyObjects: true,
  maxDepth: DEFAULT_MAX_DEPTH,
};

/**
 * Recursively strips null, undefined, and (optionally) empty strings,
 * empty arrays, and empty objects from a value.
 *
 * @param value   - Any JSON-compatible value.
 * @param options - Cleaning options.
 * @returns A new cleaned value, or `undefined` if the entire top-level
 *          value should be removed.
 *
 * @example
 * removeNulls({ a: null, b: { c: undefined, d: "hello" } })
 * // → { b: { d: "hello" } }
 *
 * @example
 * removeNulls({ a: "", b: 0 }, { removeEmptyStrings: false })
 * // → { a: "", b: 0 }
 */
export function removeNulls<T>(
  value: T,
  options: RemoveNullsOptions = {}
): T | undefined {
  const opts: Required<RemoveNullsOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const ctx = createTraversalContext();

  function clean(current: unknown, depth: number): unknown {
    // Depth guard — return as-is beyond limit
    if (depth > opts.maxDepth) return current;

    // Null / undefined — always remove
    if (current === null || current === undefined) return undefined;

    // Empty string — conditionally remove
    if (current === "" && opts.removeEmptyStrings) return undefined;

    // ── Array ────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      const cleaned = current
        .map((item) => clean(item, depth + 1))
        .filter((item) => item !== undefined);

      if (opts.removeEmptyArrays && cleaned.length === 0) return undefined;

      return cleaned;
    }

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      // Circular reference guard
      if (ctx.hasSeen(current)) return undefined;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const key of Object.keys(current)) {
        if (isUnsafeKey(key)) continue;

        const cleaned = clean(
          (current as Record<string, unknown>)[key],
          depth + 1
        );

        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }

      ctx.unmarkSeen(current);

      if (opts.removeEmptyObjects && Object.keys(result).length === 0) {
        return undefined;
      }

      return result;
    }

    // ── Primitive (number, boolean, string with content) ─────────────────────
    return current;
  }

  return clean(value, 0) as T | undefined;
}

/**
 * Returns true if the given value is considered "empty" by @heyblank-labs/json-flux standards:
 * null, undefined, empty string, empty array, or an object with no keys.
 *
 * Useful as a standalone guard.
 *
 * @example
 * isEmpty(null)      // → true
 * isEmpty("")        // → true
 * isEmpty([])        // → true
 * isEmpty({})        // → true
 * isEmpty(0)         // → false (zero is a valid value)
 * isEmpty("hello")   // → false
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}
