// =============================================================================
// transform/humanize.ts
// Transforms the KEYS of a JSON object into human-readable labels,
// preserving all original values unchanged.
//
// Design:
//  • Deep by default — recurses into nested objects and arrays.
//  • Optional flatten mode — collapses to one level with humanized path keys.
//  • Explicit label overrides take priority.
//  • Cycle-safe via WeakSet.
//  • Pure — never mutates input.
// =============================================================================

import type { HumanizeOptions, LabelOptions } from "../types/section.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { toDisplayLabel } from "./label.js";
import { flattenObject } from "../core/flatten.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transforms the keys of an object into human-readable labels.
 * All values are preserved as-is.
 *
 * @param obj     - The object whose keys should be humanized.
 * @param options - Transformation options.
 * @returns A new object with humanized keys.
 *
 * @example
 * humanize({ firstName: "Alice", user_id: 1 })
 * // → { "First Name": "Alice", "User ID": 1 }
 *
 * @example
 * humanize({ user: { firstName: "Alice" } }, { deep: true })
 * // → { "User": { "First Name": "Alice" } }
 *
 * @example
 * humanize({ user: { firstName: "Alice" } }, { flatten: true })
 * // → { "User First Name": "Alice" }
 *
 * @example
 * humanize({ dob: "1990-01-01" }, { labels: { dob: "Date of Birth" } })
 * // → { "Date of Birth": "1990-01-01" }
 */
export function humanize(
  obj: Record<string, unknown>,
  options: HumanizeOptions = {}
): Record<string, JsonValue> {
  const {
    deep = true,
    flatten = false,
    labels = {},
    labelOptions = {},
  } = options;

  // Flatten mode: flatten first, then humanize each dot-notation key
  if (flatten) {
    return humanizeFlat(obj, labels, labelOptions);
  }

  const ctx = createTraversalContext();
  return deepHumanize(obj, labels, labelOptions, deep, ctx, 0) as Record<
    string,
    JsonValue
  >;
}

/**
 * Humanizes an array of objects, applying the same key transformation
 * to every item in the array.
 *
 * @example
 * humanizeArray([{ firstName: "Alice" }, { firstName: "Bob" }])
 * // → [{ "First Name": "Alice" }, { "First Name": "Bob" }]
 */
export function humanizeArray(
  arr: readonly Record<string, unknown>[],
  options: HumanizeOptions = {}
): Record<string, JsonValue>[] {
  return arr.map((item) => humanize(item, options));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveLabel(
  key: string,
  labels: Readonly<Record<string, string>>,
  labelOptions: LabelOptions
): string {
  // Explicit override takes absolute priority
  if (Object.prototype.hasOwnProperty.call(labels, key)) {
    return labels[key] as string;
  }
  // Case-insensitive lookup in overrides
  const lowerKey = key.toLowerCase();
  const overrideKey = Object.keys(labels).find(
    (k) => k.toLowerCase() === lowerKey
  );
  if (overrideKey !== undefined) return labels[overrideKey] as string;

  return toDisplayLabel(key, labelOptions);
}

function deepHumanize(
  current: unknown,
  labels: Readonly<Record<string, string>>,
  labelOptions: LabelOptions,
  deep: boolean,
  ctx: ReturnType<typeof createTraversalContext>,
  depth: number
): unknown {
  if (depth > DEFAULT_MAX_DEPTH) return current;

  if (isPlainObject(current)) {
    if (ctx.hasSeen(current)) return "[Circular]";
    ctx.markSeen(current);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(current)) {
      if (isUnsafeKey(key)) continue;

      const humanKey = resolveLabel(key, labels, labelOptions);
      result[humanKey] = deep
        ? deepHumanize(value, labels, labelOptions, deep, ctx, depth + 1)
        : value;
    }

    ctx.unmarkSeen(current);
    return result;
  }

  if (Array.isArray(current)) {
    return current.map((item) =>
      deep
        ? deepHumanize(item, labels, labelOptions, deep, ctx, depth + 1)
        : item
    );
  }

  return current;
}

function humanizeFlat(
  obj: Record<string, unknown>,
  labels: Readonly<Record<string, string>>,
  labelOptions: LabelOptions
): Record<string, JsonValue> {
  const { data } = flattenObject(obj);
  const result: Record<string, JsonValue> = {};

  for (const [dotPath, value] of Object.entries(data)) {
    // Build a humanized label from the full path segments
    const segments = dotPath.split(".");
    const humanSegments = segments.map((seg) =>
      resolveLabel(seg, labels, labelOptions)
    );
    const humanKey = humanSegments.join(" ");
    result[humanKey] = value;
  }

  return result;
}
