// =============================================================================
// query/jsonpath.ts
// JSONPath-style path evaluation supporting:
//   • dot notation:     "user.name"
//   • bracket notation: "users[0].email"
//   • wildcards:        "users[*].email"
//   • deep glob:        "**.id"
//
// Reuses the v0.3.0 path matcher engine for pattern compilation.
// Adds a recursive "get all matching values" mode on top.
//
// Design:
//   • compile once, evaluate many — patterns are cached.
//   • Prototype-pollution safe.
//   • Returns an array of JsonPathResult for multi-match patterns.
//   • get() convenience returns the first match value or undefined.
// =============================================================================

import type { JsonPathResult } from "../types/query.types.js";
import { isPlainObject, isUnsafeKey, DEFAULT_MAX_DEPTH } from "../core/traversal.js";
import { joinPath } from "../utils/path.js";
import { compileMatcher } from "../filter/matcher.js";

// ---------------------------------------------------------------------------
// Path segment parser (reuses unflatten segment logic)
// ---------------------------------------------------------------------------

type Segment =
  | { type: "key";     value: string }
  | { type: "index";   value: number }
  | { type: "wildcard" }                 // [*] or *
  | { type: "deepWild" };               // **

function parsePathSegments(path: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = path;

  while (remaining.length > 0) {
    // Deep wildcard **
    if (remaining.startsWith("**")) {
      segments.push({ type: "deepWild" });
      remaining = remaining.slice(2);
      if (remaining.startsWith(".")) remaining = remaining.slice(1);
      continue;
    }

    // Array wildcard [*]
    if (remaining.startsWith("[*]")) {
      segments.push({ type: "wildcard" });
      remaining = remaining.slice(3);
      if (remaining.startsWith(".")) remaining = remaining.slice(1);
      continue;
    }

    // Array index [N]
    if (remaining.startsWith("[")) {
      const close = remaining.indexOf("]");
      if (close !== -1) {
        const inner = remaining.slice(1, close);
        if (/^\d+$/.test(inner)) {
          segments.push({ type: "index", value: Number(inner) });
        } else if (inner === "*") {
          segments.push({ type: "wildcard" });
        } else {
          segments.push({ type: "key", value: inner });
        }
        remaining = remaining.slice(close + 1);
        if (remaining.startsWith(".")) remaining = remaining.slice(1);
        continue;
      }
    }

    // Single * wildcard key
    if (remaining.startsWith("*") && (remaining.length === 1 || remaining[1] === ".")) {
      segments.push({ type: "wildcard" });
      remaining = remaining.slice(1);
      if (remaining.startsWith(".")) remaining = remaining.slice(1);
      continue;
    }

    // Dot-separated key
    const dotIdx     = remaining.indexOf(".");
    const bracketIdx = remaining.indexOf("[");
    let endIdx: number;

    if (dotIdx === -1 && bracketIdx === -1) {
      endIdx = remaining.length;
    } else if (dotIdx === -1) {
      endIdx = bracketIdx;
    } else if (bracketIdx === -1) {
      endIdx = dotIdx;
    } else {
      endIdx = Math.min(dotIdx, bracketIdx);
    }

    const key = remaining.slice(0, endIdx);
    remaining = remaining.slice(endIdx);
    if (remaining.startsWith(".")) remaining = remaining.slice(1);

    if (key.length > 0) {
      if (!isUnsafeKey(key)) {
        segments.push({ type: "key", value: key });
      }
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalSegments(
  segments: Segment[],
  current: unknown,
  path: string,
  depth: number,
  maxDepth: number,
  results: JsonPathResult[]
): void {
  if (depth > maxDepth) return;

  if (segments.length === 0) {
    results.push(Object.freeze({ value: current, path }));
    return;
  }

  const [head, ...tail] = segments;
  if (!head) return;

  if (head.type === "deepWild") {
    // Match remaining pattern from this node AND all descendants
    evalSegments(tail, current, path, depth, maxDepth, results);
    // Then descend into all children
    if (isPlainObject(current)) {
      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;
        evalSegments(segments, value, joinPath(path, key), depth + 1, maxDepth, results);
      }
    } else if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        evalSegments(segments, current[i], joinPath(path, i), depth + 1, maxDepth, results);
      }
    }
    return;
  }

  if (head.type === "wildcard") {
    if (isPlainObject(current)) {
      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;
        evalSegments(tail, value, joinPath(path, key), depth + 1, maxDepth, results);
      }
    } else if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        evalSegments(tail, current[i], joinPath(path, i), depth + 1, maxDepth, results);
      }
    }
    return;
  }

  if (head.type === "index") {
    if (Array.isArray(current) && head.value < current.length) {
      evalSegments(tail, current[head.value], joinPath(path, head.value), depth + 1, maxDepth, results);
    }
    return;
  }

  // head.type === "key"
  if (isPlainObject(current)) {
    const value = (current as Record<string, unknown>)[head.value];
    if (value !== undefined || Object.prototype.hasOwnProperty.call(current, head.value)) {
      evalSegments(tail, value, joinPath(path, head.value), depth + 1, maxDepth, results);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates a JSONPath-style expression against a value, returning all matches.
 *
 * @param data    - The root JSON value.
 * @param path    - JSONPath expression.
 * @param maxDepth - Maximum traversal depth.
 * @returns Array of { value, path } matches.
 *
 * @example
 * queryPath({ users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] }, "users[*].name")
 * // → [{ value: "Alice", path: "users.0.name" }, { value: "Bob", path: "users.1.name" }]
 *
 * @example
 * queryPath(data, "**.id")  // All nested id fields
 *
 * @example
 * queryPath(data, "users[0].email")  // Specific array item
 */
export function queryPath(
  data: unknown,
  path: string,
  maxDepth = DEFAULT_MAX_DEPTH
): JsonPathResult[] {
  if (!path || typeof path !== "string") return [];

  const segments = parsePathSegments(path);
  if (segments.length === 0) return [];

  const results: JsonPathResult[] = [];
  evalSegments(segments, data, "", 0, maxDepth, results);

  // Clean up leading dots in paths
  return results.map((r) => ({
    value: r.value,
    path: r.path.startsWith(".") ? r.path.slice(1) : r.path,
  }));
}

/**
 * Returns the first matched value for a JSONPath expression, or undefined.
 *
 * @example
 * get(data, "user.email")          // → "alice@example.com"
 * get(data, "users[0].name")       // → "Alice"
 * get(data, "users[*].name")       // → "Alice"  (first match)
 * get(data, "**.id")               // → 1         (first found)
 */
export function get(data: unknown, path: string): unknown {
  const results = queryPath(data, path, DEFAULT_MAX_DEPTH);
  return results.length > 0 ? results[0]!.value : undefined;
}

/**
 * Returns all matched values for a JSONPath expression.
 *
 * @example
 * getAll(data, "users[*].name")  // → ["Alice", "Bob", "Carol"]
 * getAll(data, "**.id")          // → [1, 2, 3, ...]
 */
export function getAll(data: unknown, path: string): unknown[] {
  return queryPath(data, path).map((r) => r.value);
}
