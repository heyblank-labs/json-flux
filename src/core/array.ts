// =============================================================================
// core/array.ts
// Flattens arrays of objects into flat dot-notation records, and provides
// utilities for merging column keys across multiple flattened rows.
//
// Design:
//  • Builds on flattenObject — each array item is flattened individually.
//  • Index-based path prefix: "0.user.name", "1.user.name", etc.
//  • Merges arrayObjectPaths across all rows.
//  • Pure functions — no mutation.
// =============================================================================

import type { FlattenOptions, FlattenResult, FlatRecord } from "../types/index.js";
import { flattenObject } from "./flatten.js";
import { isPlainObject } from "./traversal.js";

export interface FlattenArrayResult {
  /** One flattened record per input item (non-objects are skipped). */
  readonly rows: readonly FlatRecord[];
  /** Union of all arrayObjectPaths across every row. */
  readonly arrayObjectPaths: readonly string[];
  /** Union of every key that appears in at least one row. */
  readonly allKeys: readonly string[];
  /** Number of input items that were skipped (non-plain-objects). */
  readonly skippedCount: number;
}

/**
 * Flattens an array of objects into an array of flat dot-notation records.
 *
 * Each item is prefixed with its zero-based index unless `omitIndexPrefix`
 * is true, in which case items are flattened directly (useful when all items
 * share the same schema and you want columns without index prefixes).
 *
 * @param arr              - Array of items to flatten.
 * @param options          - Flatten options (passed through to flattenObject).
 * @param omitIndexPrefix  - If true, skip the index prefix. Defaults to true.
 *
 * @example
 * flattenArray([{ name: "Alice" }, { name: "Bob" }])
 * // rows: [{ "name": "Alice" }, { "name": "Bob" }]
 *
 * @example
 * flattenArray([{ name: "Alice" }], {}, false)
 * // rows: [{ "0.name": "Alice" }]
 */
export function flattenArray(
  arr: readonly unknown[],
  options: FlattenOptions = {},
  omitIndexPrefix = true
): FlattenArrayResult {
  const delimiter = options.delimiter ?? ".";
  const allPathsSet = new Set<string>();
  const allKeysSet = new Set<string>();
  let skippedCount = 0;

  const rows: FlatRecord[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    if (!isPlainObject(item)) {
      skippedCount++;
      continue;
    }

    const result: FlattenResult = flattenObject(
      item as Record<string, unknown>,
      options
    );

    result.arrayObjectPaths.forEach((p) => allPathsSet.add(p));

    if (omitIndexPrefix) {
      // Use the row as-is — columns are shared across rows
      rows.push(result.data);
      Object.keys(result.data).forEach((k) => allKeysSet.add(k));
    } else {
      // Prefix every key with the item index
      const prefixed: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(result.data)) {
        const newKey = `${i}${delimiter}${key}`;
        prefixed[newKey] = value;
        allKeysSet.add(newKey);
      }
      rows.push(Object.freeze(prefixed) as FlatRecord);
    }
  }

  return Object.freeze<FlattenArrayResult>({
    rows: Object.freeze(rows),
    arrayObjectPaths: Object.freeze(Array.from(allPathsSet)),
    allKeys: Object.freeze(Array.from(allKeysSet)),
    skippedCount,
  });
}

/**
 * Collects every unique key that appears in at least one row.
 * Useful for building dynamic table column definitions.
 *
 * @param rows - Array of flat records.
 * @returns A frozen array of unique keys in insertion order.
 *
 * @example
 * collectRowKeys([{ a: 1, b: 2 }, { b: 3, c: 4 }])
 * // → ["a", "b", "c"]
 */
export function collectRowKeys(
  rows: readonly FlatRecord[]
): readonly string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Object.freeze(Array.from(keys));
}
