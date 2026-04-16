// =============================================================================
// value/computed.ts
// Injects computed/virtual fields derived from the root object.
//
// Design:
//   • Computed fields run AFTER all value transforms are applied.
//   • Paths are dot-notation; intermediate objects are created if missing.
//   • Computation function receives the full (post-transform) root object.
//   • Pure — never mutates input. Returns a new deep clone with injections.
//   • Cycle-safe (the root passed to functions is frozen).
// =============================================================================

import type { ComputedFieldFn } from "../types/value.types.js";
import type { JsonValue } from "../types/index.js";
import { isPlainObject, isUnsafeKey } from "../core/traversal.js";
import { splitPath, joinPath } from "../utils/path.js";

/**
 * Injects computed virtual fields into an object.
 *
 * @param obj      - The source object (after value transforms).
 * @param computed - Map of target dot-notation path → compute function.
 * @returns New object with virtual fields injected; list of computed paths.
 *
 * @example
 * injectComputedFields(
 *   { user: { firstName: "Alice", lastName: "Smith" } },
 *   {
 *     "user.fullName": (root) =>
 *       `${(root as any).user.firstName} ${(root as any).user.lastName}`,
 *     "user.initials": (root) =>
 *       `${(root as any).user.firstName[0]}.${(root as any).user.lastName[0]}.`,
 *   }
 * )
 * // → { user: { firstName: "Alice", lastName: "Smith", fullName: "Alice Smith", initials: "A.S." } }
 */
export function injectComputedFields(
  obj: unknown,
  computed: Readonly<Record<string, ComputedFieldFn>>
): { data: unknown; computedPaths: string[] } {
  const computedPaths: string[] = [];

  if (!isPlainObject(obj) && !Array.isArray(obj)) {
    return { data: obj, computedPaths };
  }

  // Deep-clone the object so we can inject fields without mutating input
  let result = deepCloneForComputed(obj);

  // Freeze the root for safe access by compute functions
  const frozenRoot = Object.freeze(deepCloneForComputed(obj)) as Readonly<Record<string, unknown>>;

  for (const [targetPath, fn] of Object.entries(computed)) {
    // Validate target path
    if (!targetPath || typeof fn !== "function") continue;

    const segments = splitPath(targetPath);
    if (segments.length === 0) continue;

    // Skip unsafe paths
    if (segments.some((s) => typeof s === "string" && isUnsafeKey(s))) continue;

    let computedValue: JsonValue;
    try {
      computedValue = fn(frozenRoot) as JsonValue;
    } catch {
      // If the compute function throws, inject null as a safe fallback
      computedValue = null;
    }

    // Navigate to the parent and set the leaf
    result = setDeep(result as Record<string, unknown>, segments, computedValue);
    computedPaths.push(targetPath);
  }

  return { data: result, computedPaths };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sets a value at a deep path in a plain object, creating intermediate
 * objects as needed. Returns a new object (does not mutate).
 */
function setDeep(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
  value: JsonValue
): Record<string, unknown> {
  if (segments.length === 0) return obj;

  const [head, ...rest] = segments;
  if (head === undefined) return obj;

  const key = String(head);
  if (isUnsafeKey(key)) return obj;

  const result = { ...obj };

  if (rest.length === 0) {
    // Leaf — set value directly
    result[key] = value;
  } else {
    // Intermediate — recurse, creating object if needed
    const existing = result[key];
    const child: Record<string, unknown> = isPlainObject(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    result[key] = setDeep(child, rest, value);
  }

  return result;
}

/**
 * Minimal deep clone for plain objects and arrays.
 * Sufficient for the computed field injection workflow.
 */
function deepCloneForComputed(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepCloneForComputed);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!isUnsafeKey(k)) result[k] = deepCloneForComputed(v);
    }
    return result;
  }
  return value;
}

/**
 * Builds a dot-notation path string from an array of segments.
 * Numeric segments use dot notation (e.g. "users.0.name").
 */
export function buildPath(segments: Array<string | number>): string {
  return segments.map(String).join(".");
}
