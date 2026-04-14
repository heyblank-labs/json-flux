// =============================================================================
// core/flatten.ts
// Converts a deeply nested object into a flat dot-notation record.
//
// Design decisions:
//  • Iterative where beneficial; recursive only for readability-critical paths.
//  • Circular references are safely skipped (not thrown).
//  • Keys containing the delimiter are escaped with square brackets.
//  • Pure function — never mutates input.
//  • Prototype-pollution keys are silently dropped.
// =============================================================================

import type { FlattenOptions, FlattenResult, FlatRecord } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from "./traversal.js";

/**
 * Flattens a nested object into a single-level record of dot-notation paths.
 *
 * @param obj      - The object to flatten. Must be a plain object.
 * @param options  - Configuration options.
 * @returns        A FlattenResult with `data`, `leafCount`, `maxDepthReached`,
 *                 and `arrayObjectPaths`.
 *
 * @example
 * flattenObject({ user: { name: "Alice", age: 30 } })
 * // → { data: { "user.name": "Alice", "user.age": 30 }, leafCount: 2, ... }
 *
 * @example
 * flattenObject({ a: { b: { c: 1 } } }, { maxDepth: 1 })
 * // → { data: { "a.b": { c: 1 } }, ... } (capped at depth 1)
 */
export function flattenObject(
  obj: Record<string, unknown>,
  options: FlattenOptions = {}
): FlattenResult {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const skipArrays = options.skipArrays ?? false;
  const excludeSet = new Set(options.excludeKeys ?? []);

  const data: Record<string, string | number | boolean | null> = {};
  const arrayObjectPaths: string[] = [];
  const ctx = createTraversalContext();

  let leafCount = 0;
  let maxDepthReached = 0;

  /**
   * Escape a key that itself contains the delimiter to avoid path ambiguity.
   * e.g. key "a.b" with delimiter "." → "[a.b]"
   */
  function escapeKey(key: string): string {
    return key.includes(delimiter) ? `[${key}]` : key;
  }

  /**
   * Build the child path from parent path + key.
   */
  function buildPath(parent: string, key: string): string {
    const escaped = escapeKey(key);
    return parent === "" ? escaped : `${parent}${delimiter}${escaped}`;
  }

  function traverse(current: unknown, path: string, depth: number): void {
    if (depth > maxDepth) {
      // Store whatever is here as a stringified fallback
      data[path] = JSON.stringify(current);
      leafCount++;
      return;
    }

    if (depth > maxDepthReached) maxDepthReached = depth;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) {
        // Circular reference — store a sentinel and move on
        if (path) {
          data[path] = "[Circular]";
          leafCount++;
        }
        return;
      }

      ctx.markSeen(current);

      const entries = Object.entries(current);

      if (entries.length === 0 && path) {
        data[path] = null;
        leafCount++;
        ctx.unmarkSeen(current);
        return;
      }

      for (const [key, value] of entries) {
        if (isUnsafeKey(key)) continue;
        if (excludeSet.has(key)) continue;
        traverse(value, buildPath(path, key), depth + 1);
      }

      ctx.unmarkSeen(current);
      return;
    }

    // ── Array ────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      if (current.length === 0) {
        if (path) {
          data[path] = null;
          leafCount++;
        }
        return;
      }

      if (skipArrays) {
        // Store the entire array serialised at its path
        data[path] = JSON.stringify(current);
        leafCount++;
        return;
      }

      const hasComplexItems = current.some(
        (item) => isPlainObject(item) || Array.isArray(item)
      );

      if (hasComplexItems) {
        // Array of objects — record path and store serialised
        data[path] = JSON.stringify(current);
        leafCount++;
        if (!arrayObjectPaths.includes(path)) {
          arrayObjectPaths.push(path);
        }
      } else {
        // Array of primitives — join as readable string
        data[path] = current
          .map((v) => (v === null || v === undefined ? "" : String(v)))
          .join(", ");
        leafCount++;
      }
      return;
    }

    // ── Null / undefined ─────────────────────────────────────────────────────
    if (current === null || current === undefined) {
      if (path) {
        data[path] = null;
        leafCount++;
      }
      return;
    }

    // ── Primitive ────────────────────────────────────────────────────────────
    if (
      typeof current === "string" ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      if (path) {
        data[path] = current;
        leafCount++;
      }
      return;
    }

    // ── Fallback (Date, etc.) ────────────────────────────────────────────────
    if (path) {
      data[path] = String(current);
      leafCount++;
    }
  }

  traverse(obj, "", 0);

  return Object.freeze<FlattenResult>({
    data: Object.freeze(data) as FlatRecord,
    leafCount,
    maxDepthReached,
    arrayObjectPaths: Object.freeze(arrayObjectPaths),
  });
}
