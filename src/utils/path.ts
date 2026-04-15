// =============================================================================
// utils/path.ts
// Path manipulation utilities for the filtering layer.
//
// Responsibilities:
//  • Splitting dot+bracket paths into segments
//  • Building child paths from a parent path + key
//  • Escaping / unescaping bracket-wrapped keys
//
// These are low-level utilities used by the matcher and filter functions.
// They are intentionally separate from core/extract.ts to avoid circular deps.
// =============================================================================

import { isUnsafeKey } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// Segment type
// ---------------------------------------------------------------------------

export type PathSegment = string | number;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Splits a dot+bracket notation path into an ordered array of segments.
 * Numeric bracket content is coerced to numbers (array indices).
 *
 * @example
 * splitPath("user.address.city")    // → ["user", "address", "city"]
 * splitPath("users[0].name")        // → ["users", 0, "name"]
 * splitPath("data[key].value")      // → ["data", "key", "value"]
 * splitPath("[0][1]")               // → [0, 1]
 */
export function splitPath(path: string): PathSegment[] {
  if (!path) return [];
  const segments: PathSegment[] = [];
  const re = /([^.[[\]]+)|\[(\d+)\]|\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;

  re.lastIndex = 0;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(Number(match[2])); // numeric index
    } else if (match[3] !== undefined) {
      segments.push(match[3]); // bracket string key
    }
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

/**
 * Joins a parent path with a child key using dot notation.
 * Handles empty parent (root level) gracefully.
 *
 * @example
 * joinPath("",     "user")      // → "user"
 * joinPath("user", "address")   // → "user.address"
 * joinPath("user", "0")         // → "user.0"
 */
export function joinPath(parent: string, key: string | number): string {
  const k = String(key);
  if (!parent) return k;
  return `${parent}.${k}`;
}

/**
 * Returns the parent path of a dot-notation path by stripping the last segment.
 *
 * @example
 * parentPath("user.address.city")  // → "user.address"
 * parentPath("user")               // → ""
 */
export function parentPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(0, idx);
}

/**
 * Returns the last segment (leaf key) of a dot-notation path.
 *
 * @example
 * leafKey("user.address.city")  // → "city"
 * leafKey("user")               // → "user"
 */
export function leafKey(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? path : path.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns true if any segment in the path is an unsafe prototype key.
 * Used to reject user-provided filter patterns that could be used maliciously.
 */
export function pathContainsUnsafeKey(path: string): boolean {
  const segments = splitPath(path);
  return segments.some(
    (seg) => typeof seg === "string" && isUnsafeKey(seg)
  );
}

/**
 * Validates a user-provided path or pattern string.
 * Returns false if the path is empty, contains unsafe keys, or is malformed.
 */
export function isValidPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (pathContainsUnsafeKey(path)) return false;
  // Patterns with only wildcards/globs are valid
  if (path === "**" || path === "*") return true;
  // Must contain at least one valid segment
  const segments = splitPath(path.replace(/\*/g, "_wildcard_"));
  return segments.length > 0;
}
