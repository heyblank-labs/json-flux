// =============================================================================
// utils/helpers.ts
// Shared utility functions used internally across @heyblank-labs/json-flux.
// All functions are pure and side-effect-free.
// =============================================================================

import { isPlainObject } from "../core/traversal.js";

/**
 * Deep-clones a JSON-compatible value using structured clone where available,
 * falling back to JSON parse/stringify for older environments.
 *
 * Not suitable for non-JSON values (Functions, Dates, etc.).
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Merges multiple plain objects into a new object (left-to-right, deep).
 * Later sources win on key conflicts.
 * Does not mutate any input.
 *
 * @example
 * deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 })
 * // → { a: { x: 1, y: 2 }, b: 3 }
 */
export function deepMerge(
  ...sources: Array<Record<string, unknown>>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const existing = result[key];
      const incoming = source[key];

      if (isPlainObject(existing) && isPlainObject(incoming)) {
        result[key] = deepMerge(
          existing as Record<string, unknown>,
          incoming as Record<string, unknown>
        );
      } else {
        result[key] = incoming;
      }
    }
  }

  return result;
}

/**
 * Safely converts any value to a string for display.
 * null / undefined → "" (empty string)
 * Objects / arrays → JSON.stringify (compact)
 * Everything else  → String(value)
 */
export function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable]";
  }
}

/**
 * Returns a shallow copy of an object with the specified keys omitted.
 *
 * @example
 * omitKeys({ a: 1, b: 2, c: 3 }, ["b", "c"]) // → { a: 1 }
 */
export function omitKeys<T extends Record<string, unknown>>(
  obj: T,
  keys: readonly string[]
): Partial<T> {
  const exclude = new Set(keys);
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    if (!exclude.has(key)) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return result;
}

/**
 * Returns a shallow copy of an object with only the specified keys kept.
 *
 * @example
 * pickKeys({ a: 1, b: 2, c: 3 }, ["a", "c"]) // → { a: 1, c: 3 }
 */
export function pickKeys<T extends Record<string, unknown>>(
  obj: T,
  keys: readonly string[]
): Partial<T> {
  const include = new Set(keys);
  const result: Partial<T> = {};
  for (const key of Object.keys(obj)) {
    if (include.has(key)) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return result;
}

/**
 * Checks if two JSON-compatible values are deeply equal.
 * Handles primitives, arrays, and plain objects.
 * Circular references are not handled here — use for validated JSON only.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    if (!deepEqual(keysA, keysB)) return false;
    return keysA.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }

  return false;
}
