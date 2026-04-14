// =============================================================================
// core/keys.ts
// Collects every unique key (or dot-notation path) across a deeply nested
// JSON structure.
//
// Design:
//  • Iterative BFS strategy for large flat objects; recursive for deep trees.
//  • Cycle-safe via WeakSet.
//  • Returns bare key names by default; full paths when dotNotation = true.
//  • Pure — no mutation.
// =============================================================================

import type { CollectKeysOptions, CollectKeysResult } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from "./traversal.js";

/**
 * Collects every unique key (or dot-notation path) from a nested structure.
 *
 * @param input   - The object or array to inspect.
 * @param options - Configuration options.
 * @returns A CollectKeysResult with `keys` and `totalNodes`.
 *
 * @example
 * collectAllKeys({ user: { name: "Alice", age: 30 }, active: true })
 * // → { keys: ["user", "name", "age", "active"], totalNodes: 4 }
 *
 * @example
 * collectAllKeys({ user: { name: "Alice" } }, { dotNotation: true })
 * // → { keys: ["user", "user.name"], totalNodes: 2 }
 */
export function collectAllKeys(
  input: unknown,
  options: CollectKeysOptions = {}
): CollectKeysResult {
  const dotNotation = options.dotNotation ?? false;
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const keySet = new Set<string>();
  const ctx = createTraversalContext();
  let totalNodes = 0;

  function traverse(current: unknown, path: string, depth: number): void {
    if (depth > maxDepth) return;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return; // circular — skip
      ctx.markSeen(current);

      for (const key of Object.keys(current)) {
        if (isUnsafeKey(key)) continue;

        totalNodes++;

        const childPath =
          path === "" ? key : `${path}${delimiter}${key}`;

        if (dotNotation) {
          // Always add the full path
          keySet.add(childPath);
        } else {
          // Add only the bare key name
          keySet.add(key);
        }

        traverse(
          (current as Record<string, unknown>)[key],
          childPath,
          depth + 1
        );
      }

      ctx.unmarkSeen(current);
      return;
    }

    // ── Array ────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        const childPath = path === "" ? `${i}` : `${path}${delimiter}${i}`;
        traverse(current[i], childPath, depth + 1);
      }
    }

    // Primitives have no keys to collect
  }

  traverse(input, "", 0);

  return Object.freeze<CollectKeysResult>({
    keys: Object.freeze(Array.from(keySet)),
    totalNodes,
  });
}
