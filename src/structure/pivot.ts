// =============================================================================
// structure/pivot.ts
// Converts between array ↔ keyed-object representations.
//
// arrayToObject: [{ id: "a", val: 1 }, { id: "b", val: 2 }]
//   → { a: { val: 1 }, b: { val: 2 } }
//
// objectToArray: { a: { val: 1 }, b: { val: 2 } }
//   → [{ key: "a", val: 1 }, { key: "b", val: 2 }]
//
// Design:
//   • Pure — never mutates input.
//   • Prototype-pollution safe.
//   • Supports nested pivots via maxDepth.
// =============================================================================

import type { PivotOptions } from "../types/structure.types.js";
import { isPlainObject, isUnsafeKey } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// arrayToObject
// ---------------------------------------------------------------------------

/**
 * Converts an array of objects into a keyed record, using a specified field
 * as the key.
 *
 * @param arr       - Array of plain objects.
 * @param keyField  - The field in each object to use as the output key.
 * @returns A record keyed by the specified field. Items without the key are skipped.
 *
 * @example
 * arrayToObject(
 *   [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }],
 *   "id"
 * )
 * // → { a: { name: "Alice" }, b: { name: "Bob" } }
 * // (keyField "id" is removed from the value)
 */
export function arrayToObject(
  arr: readonly unknown[],
  keyField: string
): Record<string, unknown> {
  if (isUnsafeKey(keyField)) return {};

  const result: Record<string, unknown> = {};

  for (const item of arr) {
    if (!isPlainObject(item)) continue;

    const obj = item as Record<string, unknown>;
    const keyValue = obj[keyField];
    if (keyValue === undefined || keyValue === null) continue;

    const key = String(keyValue);
    if (isUnsafeKey(key)) continue;

    // Omit the keyField from the value to avoid duplication
    const { [keyField]: _omitted, ...rest } = obj;
    result[key] = rest;
  }

  return result;
}

// ---------------------------------------------------------------------------
// objectToArray
// ---------------------------------------------------------------------------

/**
 * Converts a keyed record into an array of objects, injecting the original
 * key as a field in each item.
 *
 * @param obj       - A plain object to convert.
 * @param keyName   - Name of the field to store the original key. Default: "key".
 * @param valueName - When the value is a primitive, this field stores it. Default: "value".
 * @returns An array of objects.
 *
 * @example
 * objectToArray({ a: { name: "Alice" }, b: { name: "Bob" } })
 * // → [{ key: "a", name: "Alice" }, { key: "b", name: "Bob" }]
 *
 * @example
 * // Primitive values
 * objectToArray({ active: true, score: 42 })
 * // → [{ key: "active", value: true }, { key: "score", value: 42 }]
 */
export function objectToArray(
  obj: Record<string, unknown>,
  keyName = "key",
  valueName = "value"
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (isUnsafeKey(key)) continue;

    if (isPlainObject(value)) {
      // Merge the key field into the existing object
      result.push({
        [keyName]: key,
        ...(value as Record<string, unknown>),
      });
    } else {
      // Primitive value — store as { [keyName]: key, [valueName]: value }
      result.push({ [keyName]: key, [valueName]: value });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// pivotStructure — unified entry point
// ---------------------------------------------------------------------------

/**
 * Converts between array ↔ keyed-object representations.
 *
 * @param input     - The source data (array or object).
 * @param direction - "arrayToObject" or "objectToArray".
 * @param options   - Pivot configuration.
 * @returns The pivoted structure.
 *
 * @example
 * // Array → Object
 * pivotStructure(
 *   [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }],
 *   "arrayToObject",
 *   { keyField: "id" }
 * )
 * // → { u1: { name: "Alice" }, u2: { name: "Bob" } }
 *
 * @example
 * // Object → Array
 * pivotStructure(
 *   { u1: { name: "Alice" }, u2: { name: "Bob" } },
 *   "objectToArray",
 *   { keyName: "userId" }
 * )
 * // → [{ userId: "u1", name: "Alice" }, { userId: "u2", name: "Bob" }]
 */
export function pivotStructure(
  input: unknown,
  direction: "arrayToObject" | "objectToArray",
  options: PivotOptions = {}
): unknown {
  const keyName = options.keyName ?? "key";
  const valueName = options.valueName ?? "value";

  if (direction === "arrayToObject") {
    if (!Array.isArray(input)) {
      throw new Error(
        '[json-flux] pivotStructure: "arrayToObject" requires an array input.'
      );
    }
    const keyField = options.keyField;
    if (!keyField) {
      throw new Error(
        '[json-flux] pivotStructure: "arrayToObject" requires options.keyField.'
      );
    }
    return arrayToObject(input, keyField);
  }

  // objectToArray
  if (!isPlainObject(input)) {
    throw new Error(
      '[json-flux] pivotStructure: "objectToArray" requires a plain object input.'
    );
  }
  return objectToArray(input as Record<string, unknown>, keyName, valueName);
}
