// =============================================================================
// filter/include.ts
// Whitelist-based filtering: keeps only specified keys and removes everything else.
//
// Design:
//   • Matchers compiled once before traversal.
//   • Structure-preserving: ancestors of included paths are always kept so the
//     output has a valid, fully navigable shape.
//   • Handles bare keys (match at any depth), full dot paths, wildcards.
//   • Cycle-safe, pure, immutable output.
// =============================================================================

import type { IncludeOptions, FilterResult } from "../types/filter.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches, type PathMatcher } from "./matcher.js";
import { joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Keeps only the specified keys in a JSON object, removing everything else.
 *
 * Rules:
 *   - Ancestor keys are always preserved so included deep paths are reachable.
 *   - Bare key names (e.g. `"name"`) match at any depth.
 *   - Exact dot paths (e.g. `"user.address.city"`) match only at that path.
 *   - Wildcards (e.g. `"user.*.id"`, `"**.name"`) match via pattern.
 *   - Entire subtrees are kept when a path points to an object node.
 *
 * @example
 * includeKeys(
 *   { user: { name: "Alice", password: "x", address: { city: "London" } }, meta: { id: 1 } },
 *   ["user.name", "user.address.city"]
 * ).data
 * // → { user: { name: "Alice", address: { city: "London" } } }
 *
 * @example
 * includeKeys(
 *   { users: [{ id: 1, name: "Alice", token: "x" }, { id: 2, name: "Bob", token: "y" }] },
 *   ["users[*].id", "users[*].name"]
 * ).data
 * // → { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] }
 *
 * @example
 * // Bare key — matches at any depth
 * includeKeys({ a: { name: "x" }, b: { name: "y", secret: "z" } }, ["name"]).data
 * // → { a: { name: "x" }, b: { name: "y" } }
 */
export function includeKeys<T = unknown>(
  obj: T,
  keys: readonly string[],
  options: IncludeOptions = {}
): FilterResult<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const deep = options.deep ?? true;
  const ci = options.caseInsensitive ?? false;
  const matcherOpts = { caseInsensitive: ci };

  // Separate bare-key patterns from path patterns for efficient routing
  const removedPaths: string[] = [];
  const ctx = createTraversalContext();
  const bareKeyPatterns = keys.filter(
    (k) => !k.includes(".") && !k.includes("[") && !k.includes("*")
  );
  const bareKeySet = new Set(
    ci ? bareKeyPatterns.map((k) => k.toLowerCase()) : bareKeyPatterns
  );
  const pathMatchers = compileMatchers(
    keys.filter((k) => k.includes(".") || k.includes("[") || k.includes("*")),
    matcherOpts
  );

  function isDirectMatch(childPath: string, key: string): boolean {
    // Bare key: match on the key itself (case-insensitive if configured)
    const normalizedKey = ci ? key.toLowerCase() : key;
    if (bareKeySet.has(normalizedKey)) return true;
    // Path pattern: match on the full dot-notation path
    return anyMatcherMatches(pathMatchers, childPath);
  }

  function isAncestorPath(childPath: string): boolean {
    // A path is an ancestor if any path matcher considers it a prefix
    return isAncestorOfIncluded(childPath, pathMatchers);
  }

  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return current;

    // ── Plain object ─────────────────────────────────────────────────────────
    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;

        const childPath = joinPath(path, key);

        if (isDirectMatch(childPath, key)) {
          // Direct match — keep entire subtree as-is
          result[key] = value;
        } else if (isAncestorPath(childPath)) {
          // Ancestor of a path pattern — recurse to find matched children
          const processed = deep ? traverse(value, childPath, depth + 1) : value;
          // Keep the ancestor even if empty (structure preservation)
          result[key] = processed;
        } else if (bareKeySet.size > 0 && isPlainObject(value)) {
          // Bare keys exist and this node is an object — recurse to find bare key matches inside
          const processed = traverse(value, childPath, depth + 1);
          if (
            isPlainObject(processed) &&
            Object.keys(processed as object).length > 0
          ) {
            result[key] = processed;
          } else {
            removedPaths.push(childPath);
          }
        } else {
          // Not matched, not an ancestor, not a container worth descending
          removedPaths.push(childPath);
        }
      }

      ctx.unmarkSeen(current);
      return result;
    }

    // ── Array ─────────────────────────────────────────────────────────────────
    if (Array.isArray(current)) {
      return current.map((item, i) =>
        traverse(item, joinPath(path, i), depth + 1)
      );
    }

    return current;
  }

  const data = traverse(obj, "", 0) as T;

  return Object.freeze<FilterResult<T>>({
    data,
    removedCount: removedPaths.length,
    removedPaths: Object.freeze(removedPaths),
  });
}

/**
 * Convenience variant that returns the filtered value directly (no metadata).
 *
 * @example
 * includeKeysDirect({ a: 1, b: 2, c: 3 }, ["a", "c"])
 * // → { a: 1, c: 3 }
 */
export function includeKeysDirect<T = unknown>(
  obj: T,
  keys: readonly string[],
  options: IncludeOptions = {}
): T {
  return includeKeys(obj, keys, options).data;
}

// ---------------------------------------------------------------------------
// Internal: ancestor detection
// ---------------------------------------------------------------------------

/**
 * Returns true if `path` is a strict ancestor (prefix) of at least one
 * included pattern. This ensures parent nodes are preserved when a deep
 * child path is included.
 *
 * For glob patterns we check whether the path could be a prefix leading to
 * a pattern match — this is approximated by trying all suffixes.
 */
function isAncestorOfIncluded(path: string, matchers: PathMatcher[]): boolean {
  for (const matcher of matchers) {
    if (couldBeAncestorOf(path, matcher.pattern)) return true;
  }
  return false;
}

/**
 * Checks whether `candidatePath` could be an ancestor of `pattern`.
 *
 * Strategy: `candidatePath` is an ancestor if `pattern` starts with
 * `candidatePath + "."` (exact), or if the pattern has a glob segment
 * that could eventually match after `candidatePath`.
 */
function couldBeAncestorOf(candidatePath: string, pattern: string): boolean {
  if (!candidatePath) return true; // root is ancestor of everything

  // Bare key pattern (no dot, no wildcard) — can match at any depth,
  // so any intermediate path is a potential ancestor
  const isBareKey = !pattern.includes(".") && !pattern.includes("[") && !pattern.includes("*");
  if (isBareKey) return true;

  // Normalise array notation for comparison
  const normCandidate = candidatePath.replace(/\[(\d+)\]/g, ".$1");
  const normPattern = pattern.replace(/\[(\*|\d+)\]/g, ".*");

  // Exact prefix check: pattern starts with candidate + "."
  if (normPattern.startsWith(normCandidate + ".")) return true;
  if (normPattern.startsWith(normCandidate + "[")) return true;

  // Glob check: ** can start from root so any path could be ancestor
  if (normPattern.startsWith("**")) return true;

  // Check if any prefix of the pattern matches candidate
  // e.g. candidate "user", pattern "user.*.secret"
  const patternParts = normPattern.split(".");
  const candidateParts = normCandidate.split(".");

  if (candidateParts.length >= patternParts.length) return false;

  for (let i = 0; i < candidateParts.length; i++) {
    const pp = patternParts[i] ?? "";
    const cp = candidateParts[i] ?? "";
    if (pp === "**" || pp === "*") continue;
    if (pp !== cp) return false;
  }
  return true;
}
