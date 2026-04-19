// =============================================================================
// query/aggregate.ts
// Aggregation functions for the query engine.
// All operate on a materialized array and return concrete values.
//
// Design:
//   • Pure functions — no mutation.
//   • KeySelector receives a single item and returns a comparable value.
//   • Map-based groupBy for O(n) performance.
//   • JSON-based deduplication for distinct() on non-primitive keys.
// =============================================================================

import type { GroupResult, KeySelector } from "../types/query.types.js";

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------

/**
 * Groups items by the result of a key selector.
 *
 * @example
 * groupBy([{country:"IN"},{country:"US"},{country:"IN"}], x => x.country)
 * // → [{ key: "IN", items: [...], count: 2 }, { key: "US", items: [...], count: 1 }]
 */
export function groupBy<T, K>(
  items: readonly T[],
  keySelector: KeySelector<T, K>
): GroupResult<K, T>[] {
  const map = new Map<string, { key: K; items: T[] }>();
  const insertionOrder: string[] = [];

  for (const item of items) {
    let key: K;
    try {
      key = keySelector(item);
    } catch {
      continue;
    }

    const mapKey =
      typeof key === "string" || typeof key === "number" || typeof key === "boolean"
        ? String(key)
        : JSON.stringify(key);

    if (!map.has(mapKey)) {
      map.set(mapKey, { key, items: [] });
      insertionOrder.push(mapKey);
    }
    map.get(mapKey)!.items.push(item);
  }

  return insertionOrder.map((k) => {
    const group = map.get(k)!;
    return Object.freeze({
      key: group.key,
      items: Object.freeze(group.items) as readonly T[],
      count: group.items.length,
    }) as GroupResult<K, T>;
  });
}

// ---------------------------------------------------------------------------
// Numeric aggregations
// ---------------------------------------------------------------------------

/**
 * Sums the numeric result of a selector across all items.
 * Non-numeric values (null, undefined, NaN) are treated as 0.
 *
 * @example
 * sum([{salary:100},{salary:200}], x => x.salary) // → 300
 */
export function sum<T>(
  items: readonly T[],
  selector: KeySelector<T, number>
): number {
  let total = 0;
  for (const item of items) {
    let val: number;
    try { val = selector(item); } catch { val = 0; }
    if (typeof val === "number" && isFinite(val)) total += val;
  }
  return total;
}

/**
 * Computes the arithmetic mean of the selected numeric values.
 * Returns NaN for empty arrays.
 */
export function avg<T>(
  items: readonly T[],
  selector: KeySelector<T, number>
): number {
  if (items.length === 0) return NaN;
  return sum(items, selector) / items.length;
}

/**
 * Returns the minimum numeric value across items.
 * Returns Infinity for empty arrays.
 */
export function min<T>(
  items: readonly T[],
  selector: KeySelector<T, number>
): number {
  if (items.length === 0) return Infinity;
  let result = Infinity;
  for (const item of items) {
    let val: number;
    try { val = selector(item); } catch { continue; }
    if (typeof val === "number" && isFinite(val) && val < result) result = val;
  }
  return result;
}

/**
 * Returns the maximum numeric value across items.
 * Returns -Infinity for empty arrays.
 */
export function max<T>(
  items: readonly T[],
  selector: KeySelector<T, number>
): number {
  if (items.length === 0) return -Infinity;
  let result = -Infinity;
  for (const item of items) {
    let val: number;
    try { val = selector(item); } catch { continue; }
    if (typeof val === "number" && isFinite(val) && val > result) result = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// distinct
// ---------------------------------------------------------------------------

/**
 * Returns unique values extracted by the selector.
 * Uses JSON serialisation for deep equality of non-primitive keys.
 *
 * @example
 * distinct([{c:"IN"},{c:"US"},{c:"IN"}], x => x.c) // → ["IN", "US"]
 */
export function distinct<T, K>(
  items: readonly T[],
  selector: KeySelector<T, K>
): K[] {
  const seen = new Set<string>();
  const result: K[] = [];
  for (const item of items) {
    let key: K;
    try { key = selector(item); } catch { continue; }
    const serialised =
      typeof key === "string" || typeof key === "number" || typeof key === "boolean"
        ? String(key)
        : JSON.stringify(key);
    if (!seen.has(serialised)) {
      seen.add(serialised);
      result.push(key);
    }
  }
  return result;
}
