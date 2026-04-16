// =============================================================================
// value/formatters/enum.ts
// Maps raw enum values (strings, numbers) to human-readable display labels.
// =============================================================================

import type { EnumFormatterOptions } from "../../types/value.types.js";

/**
 * Creates an enum mapper function with a pre-bound map.
 *
 * @example
 * const fmt = createEnumFormatter({
 *   map: { PENDING: "Pending Approval", APPROVED: "Approved", REJECTED: "Rejected" }
 * });
 * fmt("PENDING")   // → "Pending Approval"
 * fmt("APPROVED")  // → "Approved"
 * fmt("UNKNOWN")   // → "UNKNOWN"  (fallback: original value)
 */
export function createEnumFormatter(options: EnumFormatterOptions) {
  const { map, fallback, caseInsensitive = false } = options;

  // Build a normalised lookup map for case-insensitive mode
  const lookupMap: Map<string, string> = new Map();
  for (const [k, v] of Object.entries(map)) {
    lookupMap.set(caseInsensitive ? k.toLowerCase() : k, v);
  }

  return function formatEnum(value: unknown): string {
    if (value === null || value === undefined) {
      return fallback ?? "—";
    }

    const key = String(value);
    const lookupKey = caseInsensitive ? key.toLowerCase() : key;
    const mapped = lookupMap.get(lookupKey);

    if (mapped !== undefined) return mapped;
    return fallback !== undefined ? fallback : key;
  };
}

/**
 * Maps a raw enum value to its display label using the provided map.
 *
 * @example
 * formatEnum("PENDING", {
 *   map: { PENDING: "Pending Approval", APPROVED: "Approved" }
 * })
 * // → "Pending Approval"
 *
 * formatEnum("unknown", {
 *   map: { PENDING: "Pending Approval" },
 *   fallback: "N/A"
 * })
 * // → "N/A"
 *
 * formatEnum("pending", {
 *   map: { PENDING: "Pending Approval" },
 *   caseInsensitive: true
 * })
 * // → "Pending Approval"
 */
export function formatEnum(
  value: unknown,
  options: EnumFormatterOptions
): string {
  return createEnumFormatter(options)(value);
}
