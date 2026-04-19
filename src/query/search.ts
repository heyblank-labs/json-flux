// =============================================================================
// query/search.ts
// Deep full-text search engine for JSON structures.
//
// Design:
//   • Single depth-first traversal — visits each node once.
//   • Case-insensitive by default, whole-word optional.
//   • Collects { path, key, value, keyword } per match.
//   • Prototype-pollution safe — uses isUnsafeKey guard.
//   • Stops early when limit is reached.
// =============================================================================

import type { SearchMatch, SearchOptions } from "../types/query.types.js";
import type { JsonValue } from "../types/index.js";
import { isPlainObject, isUnsafeKey, DEFAULT_MAX_DEPTH } from "../core/traversal.js";
import { joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchesKeyword(
  value: string,
  keyword: string,
  wholeWord: boolean
): boolean {
  const haystack = value.toLowerCase();
  const needle   = keyword.toLowerCase();

  if (!haystack.includes(needle)) return false;

  if (wholeWord) {
    // Must appear as a standalone word (bounded by non-alphanumeric chars)
    const re = new RegExp(`(?<![\\w])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i");
    return re.test(value);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Searches deeply through a JSON value for fields containing the keyword.
 *
 * @param data     - The root JSON value to search.
 * @param keywords - One or more keywords to search for (OR logic).
 * @param options  - Search configuration.
 * @returns An array of SearchMatch objects, one per matching field.
 *
 * @example
 * search({ user: { name: "Alice", city: "London" } }, "alice")
 * // → [{ path: "user.name", key: "name", value: "Alice", keyword: "alice" }]
 *
 * @example
 * // Multiple keywords (OR)
 * search(data, ["john", "alice"])
 *
 * @example
 * // Numbers are stringified for comparison
 * search({ id: 42 }, "42")
 * // → [{ path: "id", key: "id", value: 42, keyword: "42" }]
 */
export function search(
  data: unknown,
  keywords: string | string[],
  options: SearchOptions = {}
): SearchMatch[] {
  const {
    wholeWord    = false,
    stringsOnly  = false,
    maxDepth     = DEFAULT_MAX_DEPTH,
    limit        = Infinity,
  } = options;

  const kws = (Array.isArray(keywords) ? keywords : [keywords])
    .filter((k) => typeof k === "string" && k.length > 0);

  if (kws.length === 0) return [];

  const matches: SearchMatch[] = [];
  const seen = new WeakSet<object>();

  function traverse(current: unknown, path: string, depth: number): void {
    if (matches.length >= limit) return;
    if (depth > maxDepth) return;

    if (isPlainObject(current)) {
      if (seen.has(current)) return;
      seen.add(current);

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;
        const childPath = joinPath(path, key);
        traverse(value, childPath, depth + 1);
      }
      return;
    }

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        if (matches.length >= limit) return;
        traverse(current[i], joinPath(path, i), depth + 1);
      }
      return;
    }

    // Leaf value — check against all keywords
    if (current === null || current === undefined) return;
    if (stringsOnly && typeof current !== "string") return;

    const strValue = String(current);
    const lastDot  = path.lastIndexOf(".");
    const key      = lastDot === -1 ? path : path.slice(lastDot + 1);

    for (const kw of kws) {
      if (matchesKeyword(strValue, kw, wholeWord)) {
        matches.push(
          Object.freeze({
            path,
            key,
            value: current as JsonValue,
            keyword: kw,
          }) as SearchMatch
        );
        if (matches.length >= limit) return;
        break; // One match per node per traversal
      }
    }
  }

  traverse(data, "", 0);

  // Remove empty leading dot from root-level paths
  return matches.map((m) =>
    m.path.startsWith(".") ? { ...m, path: m.path.slice(1) } : m
  );
}

/**
 * Returns true if any field in the data matches the keyword.
 * Short-circuits on first match for O(1) best case.
 */
export function searchAny(
  data: unknown,
  keyword: string,
  options?: SearchOptions
): boolean {
  return search(data, keyword, { ...options, limit: 1 }).length > 0;
}
