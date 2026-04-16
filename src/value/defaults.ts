// =============================================================================
// value/defaults.ts
// Applies default values to missing or null fields in a JSON object.
//
// Design:
//   • Path-based defaults map: "user.name" → "N/A"
//   • Bare key defaults also supported: "name" → "N/A"
//   • Wildcard patterns via the filter layer matcher
//   • Only fills null/undefined — never overwrites existing values
//   • Pure — never mutates input
// =============================================================================

import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches } from "../filter/matcher.js";
import { joinPath } from "../utils/path.js";

export interface ApplyDefaultsOptions {
  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;
}

/**
 * Applies default values to missing or null fields.
 *
 * The defaults map accepts:
 *   - Bare key names:      `"name"` → fills `name` at any depth
 *   - Exact dot paths:     `"user.address.city"` → fills only that path
 *   - Wildcard patterns:   `"users[*].role"` → fills role in every user array item
 *
 * A field receives its default only when its current value is null or undefined.
 * Non-null, non-undefined values are always preserved.
 *
 * @example
 * applyDefaults(
 *   { user: { name: "Alice", age: null, role: undefined } },
 *   { "user.age": 0, "user.role": "viewer", "user.missing": "N/A" }
 * )
 * // → { user: { name: "Alice", age: 0, role: "viewer", missing: "N/A" } }
 */
export function applyDefaults(
  obj: unknown,
  defaults: Readonly<Record<string, JsonValue>>,
  options: ApplyDefaultsOptions = {}
): { data: unknown; defaultedPaths: string[] } {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const defaultedPaths: string[] = [];
  const ctx = createTraversalContext();

  // Compile all path patterns once
  const pathPatterns = Object.keys(defaults).filter(
    (k) => k.includes(".") || k.includes("[") || k.includes("*")
  );
  const bareKeys = new Set(
    Object.keys(defaults).filter(
      (k) => !k.includes(".") && !k.includes("[") && !k.includes("*")
    )
  );
  const matchers = compileMatchers(pathPatterns);

  function getDefault(path: string, key: string): JsonValue | undefined {
    // Exact path match
    if (defaults[path] !== undefined) return defaults[path];
    // Bare key match
    if (bareKeys.has(key) && defaults[key] !== undefined) return defaults[key];
    // Pattern match
    if (anyMatcherMatches(matchers, path)) {
      const matchedPattern = pathPatterns.find((p) =>
        compileMatchers([p])[0]?.matches(path)
      );
      if (matchedPattern !== undefined) return defaults[matchedPattern];
    }
    return undefined;
  }

  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return current;

    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      // First: copy existing keys, applying defaults where null/undefined
      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;
        const childPath = joinPath(path, key);

        if (value === null || value === undefined) {
          const def = getDefault(childPath, key);
          if (def !== undefined) {
            result[key] = def;
            defaultedPaths.push(childPath);
          } else {
            result[key] = traverse(value, childPath, depth + 1);
          }
        } else {
          result[key] = traverse(value, childPath, depth + 1);
        }
      }

      // Second: inject missing keys that have defaults
      for (const defaultKey of Object.keys(defaults)) {
        // Only bare keys can be injected at this level
        if (!bareKeys.has(defaultKey) && !defaultKey.includes(".")) continue;

        // Exact path match at this level
        const expectedParentPath = defaultKey.includes(".")
          ? defaultKey.slice(0, defaultKey.lastIndexOf("."))
          : "";
        const leafKey = defaultKey.includes(".")
          ? defaultKey.slice(defaultKey.lastIndexOf(".") + 1)
          : defaultKey;

        if (expectedParentPath === path && !(leafKey in result)) {
          if (!isUnsafeKey(leafKey)) {
            result[leafKey] = defaults[defaultKey] as JsonValue;
            defaultedPaths.push(joinPath(path, leafKey));
          }
        }
      }

      ctx.unmarkSeen(current);
      return result;
    }

    if (Array.isArray(current)) {
      return current.map((item, i) => traverse(item, joinPath(path, i), depth + 1));
    }

    return current;
  }

  const data = traverse(obj, "", 0);
  return { data, defaultedPaths };
}
