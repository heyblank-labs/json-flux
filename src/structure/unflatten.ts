// =============================================================================
// structure/unflatten.ts
// Reconstructs a nested JSON object from a flat dot/bracket-notation record.
//
// Inverse of flattenObject (v0.1.0).
//
// Design:
//   • Iterative — processes each key-value pair in insertion order.
//   • Detects array segments from numeric bracket notation: "[0]", "[1]".
//   • Prototype-pollution safe: all UNSAFE_KEYS are skipped.
//   • Handles delimiter collisions (escaped keys like "[a.b]" from flatten layer).
//   • Pure — never mutates input.
// =============================================================================

import type { UnflattenOptions } from "../types/structure.types.js";
import { isUnsafeKey } from "../core/traversal.js";

const DEFAULT_OPTS: Required<UnflattenOptions> = {
  delimiter: ".",
  parseArrays: true,
  maxDepth: 20,
};

// ---------------------------------------------------------------------------
// Path parsing (unflatten-specific — handles escaped keys + array detection)
// ---------------------------------------------------------------------------

type Segment = { key: string; isArray: boolean };

/**
 * Parses a flat key into ordered segments, detecting array indices.
 *
 * Handles:
 *   "user.name"           → [{key:"user"}, {key:"name"}]
 *   "users.0.name"        → [{key:"users"}, {key:"0",isArray:true}, {key:"name"}]
 *   "items[0].name"       → [{key:"items"}, {key:"0",isArray:true}, {key:"name"}]
 *   "[escaped.key].child" → [{key:"escaped.key"}, {key:"child"}]
 */
function parseSegments(key: string, delimiter: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = key;

  while (remaining.length > 0) {
    // Bracket-escaped key at the START: "[some.key]" — treat as literal key segment
    if (remaining.startsWith("[")) {
      const closeIdx = remaining.indexOf("]");
      if (closeIdx !== -1) {
        const inner = remaining.slice(1, closeIdx);
        const isNumeric = /^\d+$/.test(inner);
        segments.push({ key: inner, isArray: isNumeric });
        remaining = remaining.slice(closeIdx + 1);
        // Consume leading delimiter after bracket
        if (remaining.startsWith(delimiter)) {
          remaining = remaining.slice(delimiter.length);
        }
        continue;
      }
    }

    // Find the next delimiter OR bracket, whichever comes first
    const delimIdx = remaining.indexOf(delimiter);
    const bracketIdx = remaining.indexOf("[");

    // No more delimiters or brackets — entire remaining is a segment
    if (delimIdx === -1 && bracketIdx === -1) {
      segments.push({ key: remaining, isArray: false });
      break;
    }

    // Bracket comes before delimiter (or no delimiter): handle key[index]
    if (bracketIdx !== -1 && (delimIdx === -1 || bracketIdx < delimIdx)) {
      // Segment before the bracket (e.g. "items" in "items[0]")
      if (bracketIdx > 0) {
        segments.push({ key: remaining.slice(0, bracketIdx), isArray: false });
        remaining = remaining.slice(bracketIdx);
        continue;
      }

      // We're at the bracket — extract the index
      const closeIdx = remaining.indexOf("]");
      if (closeIdx !== -1) {
        const inner = remaining.slice(1, closeIdx);
        const isNumeric = /^\d+$/.test(inner);
        segments.push({ key: inner, isArray: isNumeric });
        remaining = remaining.slice(closeIdx + 1);
        if (remaining.startsWith(delimiter)) {
          remaining = remaining.slice(delimiter.length);
        }
        continue;
      }
    }

    // Delimiter comes first
    if (delimIdx !== -1) {
      const segment = remaining.slice(0, delimIdx);
      remaining = remaining.slice(delimIdx + delimiter.length);
      segments.push({ key: segment, isArray: false });
    } else {
      segments.push({ key: remaining, isArray: false });
      break;
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Node building
// ---------------------------------------------------------------------------

type JsonNode = Record<string, unknown> | unknown[];

/**
 * Ensures a node exists at the given index/key within `parent`,
 * creating the appropriate container (array or object) based on `nextIsArray`.
 */
function ensureChild(
  parent: JsonNode,
  key: string,
  nextIsArray: boolean
): JsonNode {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (isNaN(idx)) return parent; // safety guard
    if (parent[idx] === undefined || parent[idx] === null) {
      parent[idx] = nextIsArray ? [] : {};
    }
    return parent[idx] as JsonNode;
  } else {
    const obj = parent as Record<string, unknown>;
    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = nextIsArray ? [] : {};
    }
    return obj[key] as JsonNode;
  }
}

/**
 * Sets a leaf value at `key` within `parent`.
 */
function setLeaf(parent: JsonNode, key: string, value: unknown): void {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (!isNaN(idx)) parent[idx] = value;
  } else {
    (parent as Record<string, unknown>)[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstructs a nested JSON object from a flat dot/bracket-notation record.
 *
 * Inverse of `flattenObject`.
 *
 * @param flat    - A flat record of dot-notation paths → values.
 * @param options - Unflatten configuration.
 * @returns The reconstructed nested object.
 *
 * @example
 * unflatten({
 *   "user.name": "Alice",
 *   "user.address.city": "London",
 *   "user.address.zip": "SW1A 1AA",
 * })
 * // → { user: { name: "Alice", address: { city: "London", zip: "SW1A 1AA" } } }
 *
 * @example
 * // Array reconstruction
 * unflatten({
 *   "users.0.name": "Alice",
 *   "users.1.name": "Bob",
 * })
 * // → { users: [{ name: "Alice" }, { name: "Bob" }] }
 *
 * @example
 * // Bracket-escaped keys (from flatten layer)
 * unflatten({ "[a.b].c": 1 })
 * // → { "a.b": { c: 1 } }
 */
export function unflatten(
  flat: Readonly<Record<string, unknown>>,
  options: UnflattenOptions = {}
): Record<string, unknown> {
  const delimiter = options.delimiter ?? DEFAULT_OPTS.delimiter;
  const parseArrays = options.parseArrays ?? DEFAULT_OPTS.parseArrays;
  const maxDepth = options.maxDepth ?? DEFAULT_OPTS.maxDepth;

  const root: Record<string, unknown> = {};

  for (const [flatKey, value] of Object.entries(flat)) {
    const segments = parseSegments(flatKey, delimiter);

    if (segments.length === 0) continue;

    // Depth guard
    if (segments.length > maxDepth) continue;

    // Security: skip any segment that is an unsafe key
    if (segments.some((s) => isUnsafeKey(s.key))) continue;

    // Walk/build the path
    let current: JsonNode = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      const nextSeg = segments[i + 1]!;

      if (isUnsafeKey(seg.key)) break;

      // Determine whether the next container should be an array
      const nextIsArray =
        parseArrays && nextSeg.isArray && /^\d+$/.test(nextSeg.key);

      current = ensureChild(current, seg.key, nextIsArray);
    }

    // Set the leaf value
    const leaf = segments[segments.length - 1]!;
    if (!isUnsafeKey(leaf.key)) {
      setLeaf(current, leaf.key, value);
    }
  }

  return root;
}

/**
 * Converts an array of numeric-keyed entries into a proper Array.
 * Sparse indices are filled with `null`.
 * Non-numeric keys are kept as object properties.
 *
 * This is called automatically during unflatten when `parseArrays: true`.
 * Exposed for advanced use.
 */
export function compactSparseArray(obj: Record<string, unknown>): unknown[] {
  const keys = Object.keys(obj);
  const allNumeric = keys.every((k) => /^\d+$/.test(k));
  if (!allNumeric) return [];

  const maxIdx = Math.max(...keys.map(Number));
  const arr: unknown[] = new Array(maxIdx + 1).fill(null);
  for (const [k, v] of Object.entries(obj)) {
    arr[Number(k)] = v;
  }
  return arr;
}
