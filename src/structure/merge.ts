// =============================================================================
// structure/merge.ts
// Deep merges two or more JSON objects with configurable array strategies.
//
// Design:
//   • Recursive merge — objects recurse, primitives take source value.
//   • Three array strategies: replace, concat, unique.
//   • Prototype-pollution safe — UNSAFE_KEYS never written.
//   • Pure — never mutates any input.
//   • Works with unlimited sources (reduce pattern).
// =============================================================================

import type { MergeDeepOptions, ArrayMergeStrategy } from "../types/structure.types.js";
import { isPlainObject, isUnsafeKey, DEFAULT_MAX_DEPTH } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// Internal: JSON equality for "unique" deduplication
// ---------------------------------------------------------------------------

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    if (!jsonEqual(keysA, keysB)) return false;
    return keysA.every((k) =>
      jsonEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal: merge two values
// ---------------------------------------------------------------------------

function mergeTwo(
  target: unknown,
  source: unknown,
  arrayStrategy: ArrayMergeStrategy,
  depth: number,
  maxDepth: number
): unknown {
  if (depth > maxDepth) return source;

  // Both are plain objects — recurse
  if (isPlainObject(target) && isPlainObject(source)) {
    const result: Record<string, unknown> = {
      ...(target as Record<string, unknown>),
    };
    for (const [key, srcVal] of Object.entries(
      source as Record<string, unknown>
    )) {
      if (isUnsafeKey(key)) continue;
      result[key] = mergeTwo(result[key], srcVal, arrayStrategy, depth + 1, maxDepth);
    }
    return result;
  }

  // Both are arrays — apply strategy
  if (Array.isArray(target) && Array.isArray(source)) {
    switch (arrayStrategy) {
      case "concat":
        return [...target, ...source];
      case "unique": {
        const combined = [...target, ...source];
        const unique: unknown[] = [];
        for (const item of combined) {
          if (!unique.some((u) => jsonEqual(u, item))) {
            unique.push(item);
          }
        }
        return unique;
      }
      case "replace":
      default:
        return source;
    }
  }

  // Source wins in all other cases (primitive, type mismatch)
  return source;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deeply merges two or more objects. Later arguments win on key conflicts.
 * Arrays are merged according to the `arrayStrategy` option.
 *
 * @param sources  - Two or more objects to merge (left-to-right).
 * @param options  - Merge configuration.
 * @returns A new merged object — none of the inputs are mutated.
 *
 * @example
 * mergeDeep(
 *   { user: { name: "Alice", role: "user" } },
 *   { user: { role: "admin" }, active: true }
 * )
 * // → { user: { name: "Alice", role: "admin" }, active: true }
 *
 * @example
 * // Concat array strategy
 * mergeDeep(
 *   { tags: ["a", "b"] },
 *   { tags: ["c", "d"] },
 *   { arrayStrategy: "concat" }
 * )
 * // → { tags: ["a", "b", "c", "d"] }
 *
 * @example
 * // Unique array strategy
 * mergeDeep(
 *   { tags: ["a", "b", "c"] },
 *   { tags: ["b", "c", "d"] },
 *   { arrayStrategy: "unique" }
 * )
 * // → { tags: ["a", "b", "c", "d"] }
 */
export function mergeDeep(
  source1: Record<string, unknown>,
  source2: Record<string, unknown>,
  ...rest: Array<Record<string, unknown> | MergeDeepOptions>
): Record<string, unknown> {
  // Last argument is options if it has known option keys and no other source after it
  let options: MergeDeepOptions = {};
  let additionalSources: Array<Record<string, unknown>> = [];

  for (const arg of rest) {
    if (
      arg !== null &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      ("arrayStrategy" in arg || "maxDepth" in arg) &&
      // Distinguish options from a source that happens to have those keys
      Object.keys(arg).every((k) => k === "arrayStrategy" || k === "maxDepth")
    ) {
      options = arg as MergeDeepOptions;
    } else {
      additionalSources.push(arg as Record<string, unknown>);
    }
  }

  const sources = [source1, source2, ...additionalSources];
  const arrayStrategy = options.arrayStrategy ?? "replace";
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  return sources.reduce<Record<string, unknown>>((acc, source) => {
    return mergeTwo(acc, source, arrayStrategy, 0, maxDepth) as Record<string, unknown>;
  }, {});
}
