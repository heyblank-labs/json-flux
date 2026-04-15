// =============================================================================
// filter/matcher.ts
// Path matching engine — the core of the v0.3.0 filtering layer.
//
// Supports:
//   • Exact paths:     "user.address.city"
//   • Single wildcard: "user.*.secret"       (one level)
//   • Double wildcard: "**.password"          (any depth)
//   • Array wildcards: "users[*].email"       (any array index)
//   • Mixed:           "**.user.*.secret"
//
// Design:
//   • Paths are compiled once into a PathMatcher — reuse across traversal.
//   • Matching is purely string-based — no eval, no RegExp injection.
//   • Case-insensitive mode available via options.
//   • All patterns are validated before compilation.
// =============================================================================

import type { PathMatcher, PathMatcherOptions } from "../types/filter.types.js";
export type { PathMatcher };
import { isValidPath, splitPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Pattern compilation
// ---------------------------------------------------------------------------

/**
 * Compiles a path pattern string into a reusable PathMatcher.
 *
 * Pattern syntax:
 *   "user.address.city"   — exact match
 *   "user.*.secret"       — single-segment wildcard (any one key)
 *   "**.password"         — double-star glob (any number of segments before)
 *   "users[*].email"      — array-index wildcard
 *   "user.**.id"          — glob anywhere in path
 *
 * @throws {Error} when the pattern contains unsafe keys or is malformed
 *
 * @example
 * const m = compileMatcher("user.*.secret");
 * m.matches("user.address.secret")  // → true
 * m.matches("user.secret")          // → false
 *
 * @example
 * const m = compileMatcher("**.password");
 * m.matches("password")             // → true
 * m.matches("user.password")        // → true
 * m.matches("a.b.c.password")       // → true
 */
export function compileMatcher(
  pattern: string,
  options: PathMatcherOptions = {}
): PathMatcher {
  if (!isValidPath(pattern)) {
    throw new Error(
      `[json-flux] Invalid filter pattern: "${pattern}". ` +
      `Patterns must not be empty or contain unsafe keys (__proto__, constructor, prototype).`
    );
  }

  const ci = options.caseInsensitive ?? false;
  const normalised = ci ? pattern.toLowerCase() : pattern;
  const isGlob = normalised.includes("*");

  // Pre-split the normalised pattern into segments for efficient matching
  // Replace [*] with a wildcard token before splitting
  const patternWithTokens = normalised.replace(/\[\*\]/g, ".__array_wildcard__");
  const patternSegments = splitPath(patternWithTokens);

  return {
    pattern,
    isGlob,
    matches(path: string): boolean {
      const normPath = ci ? path.toLowerCase() : path;
      const pathWithTokens = normPath.replace(/\[(\d+)\]/g, ".$1");
      const pathSegments = splitPath(pathWithTokens).map(String);
      return segmentsMatch(patternSegments.map(String), pathSegments);
    },
  };
}

/**
 * Compiles multiple patterns into an array of PathMatchers.
 * Silently skips invalid patterns (logs to console.warn in development).
 */
export function compileMatchers(
  patterns: readonly string[],
  options: PathMatcherOptions = {}
): PathMatcher[] {
  const matchers: PathMatcher[] = [];
  for (const pattern of patterns) {
    try {
      matchers.push(compileMatcher(pattern, options));
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn(String(err));
      }
    }
  }
  return matchers;
}

/**
 * Returns true if any matcher in the array matches the given path.
 * Short-circuits on first match for efficiency.
 */
export function anyMatcherMatches(
  matchers: PathMatcher[],
  path: string
): boolean {
  for (const matcher of matchers) {
    if (matcher.matches(path)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Segment-level matching (recursive, handles **)
// ---------------------------------------------------------------------------

/**
 * Recursively matches pattern segments against path segments.
 *
 * Rules:
 *   "__double_star__" segment matches zero or more path segments (greedy then backtrack)
 *   "*" or "__array_wildcard__" matches exactly one path segment
 *   Any other string must match exactly
 */
function segmentsMatch(pattern: string[], path: string[]): boolean {
  // Both exhausted → match
  if (pattern.length === 0 && path.length === 0) return true;

  // Pattern exhausted but path remains → no match
  if (pattern.length === 0) return false;

  const head = pattern[0];

  // Double-star: matches zero or more path segments
  if (head === "**") {
    const rest = pattern.slice(1);
    // Try matching rest against every suffix of the path
    for (let i = 0; i <= path.length; i++) {
      if (segmentsMatch(rest, path.slice(i))) return true;
    }
    return false;
  }

  // Path exhausted but pattern has more (non-**) → no match
  if (path.length === 0) return false;

  const pathHead = path[0] as string;
  const patternRest = pattern.slice(1);
  const pathRest = path.slice(1);

  // Single wildcard or array wildcard: matches exactly one segment
  if (head === "*" || head === "__array_wildcard__") {
    return segmentsMatch(patternRest, pathRest);
  }

  // Exact match
  if (head === pathHead) {
    return segmentsMatch(patternRest, pathRest);
  }

  return false;
}
