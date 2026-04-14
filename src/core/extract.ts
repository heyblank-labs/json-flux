// =============================================================================
// core/extract.ts
// Safe field extraction from a nested object using dot-notation paths,
// with array-index bracket notation support.
//
// Design:
//  • Iterative — no recursion, no stack overhead.
//  • Supports: "a.b.c", "users[0].name", "data[2][1].id"
//  • Returns defaultValue (or undefined) when path not found.
//  • Never throws — always gracefully falls back.
//  • Prototype-pollution key segments are blocked.
// =============================================================================

import type { ExtractOptions, JsonValue } from "../types/index.js";
import { isUnsafeKey } from "./traversal.js";

// Matches:  someKey  OR  [0]  OR  [someKey]
const SEGMENT_RE = /([^.[]+)|\[(\d+|[^\]]+)\]/g;

/**
 * Parses a dot+bracket notation path string into an ordered array of
 * string/number segments.
 *
 * @example
 * parsePath("users[0].name")   // → ["users", 0, "name"]
 * parsePath("a.b.c")           // → ["a", "b", "c"]
 * parsePath("[0][1]")          // → [0, 1]
 * parsePath("data[key].val")   // → ["data", "key", "val"]
 */
export function parsePath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  let match: RegExpExecArray | null;

  SEGMENT_RE.lastIndex = 0; // reset stateful regex

  while ((match = SEGMENT_RE.exec(path)) !== null) {
    // Group 1: plain identifier (e.g. "name", "users")
    if (match[1] !== undefined) {
      segments.push(match[1]);
      continue;
    }
    // Group 2: bracket content (e.g. "0", "someKey")
    if (match[2] !== undefined) {
      const inner = match[2];
      const asNum = Number(inner);
      segments.push(Number.isInteger(asNum) && inner !== "" ? asNum : inner);
    }
  }

  return segments;
}

/**
 * Safely retrieves a value from a nested object/array using a
 * dot-notation or bracket-notation path.
 *
 * @param obj      - The root object to search.
 * @param path     - Dot/bracket notation path, e.g. `"user.address[0].city"`.
 * @param options  - Optional config including `defaultValue`.
 * @returns The value at the path, or `defaultValue` if not found.
 *
 * @example
 * extractField({ user: { name: "Alice" } }, "user.name")
 * // → "Alice"
 *
 * @example
 * extractField({ users: [{ id: 1 }, { id: 2 }] }, "users[1].id")
 * // → 2
 *
 * @example
 * extractField({ a: 1 }, "a.b.c", { defaultValue: "N/A" })
 * // → "N/A"
 */
export function extractField(
  obj: unknown,
  path: string,
  options: ExtractOptions = {}
): JsonValue | undefined {
  if (obj === null || obj === undefined || path === "") {
    return options.defaultValue ?? undefined;
  }

  const segments = parsePath(path);

  if (segments.length === 0) {
    return options.defaultValue ?? undefined;
  }

  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return options.defaultValue ?? undefined;
    }

    // Block prototype-pollution key access at runtime
    if (typeof segment === "string" && isUnsafeKey(segment)) {
      return options.defaultValue ?? undefined;
    }

    if (typeof segment === "number") {
      // Array index access
      if (!Array.isArray(current)) {
        return options.defaultValue ?? undefined;
      }
      current = (current as unknown[])[segment];
    } else {
      // Object key access — guard against non-objects
      if (typeof current !== "object" || Array.isArray(current)) {
        return options.defaultValue ?? undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  if (current === undefined || current === null) {
    return options.defaultValue ?? (current as null | undefined);
  }

  return current as JsonValue;
}

/**
 * Checks whether a given dot-notation path exists in an object.
 * Returns true even if the value at that path is `null`.
 *
 * @example
 * hasField({ a: { b: null } }, "a.b") // → true
 * hasField({ a: 1 }, "a.b")           // → false
 */
export function hasField(obj: unknown, path: string): boolean {
  if (obj === null || obj === undefined || path === "") return false;

  const segments = parsePath(path);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return false;
    if (typeof segment === "string" && isUnsafeKey(segment)) return false;

    if (typeof segment === "number") {
      if (!Array.isArray(current)) return false;
      if (segment >= (current as unknown[]).length) return false;
      current = (current as unknown[])[segment];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return false;
      if (!(segment in (current as object))) return false;
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return true;
}
