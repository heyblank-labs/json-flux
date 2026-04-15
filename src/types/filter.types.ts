// =============================================================================
// types/filter.types.ts
// All public-facing types for the v0.3.0 Filtering & Visibility layer.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// Predicate
// ---------------------------------------------------------------------------

/**
 * A function that decides whether a field should be removed.
 *
 * @param value - The field's current value.
 * @param key   - The raw key at this node.
 * @param path  - Full dot-notation path from root, e.g. "user.address.city".
 * @returns true  → remove this field
 *          false → keep this field
 */
export type FilterPredicate = (
  value: JsonValue,
  key: string,
  path: string
) => boolean;

// ---------------------------------------------------------------------------
// Shared base options
// ---------------------------------------------------------------------------

export interface BaseFilterOptions {
  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;

  /**
   * When true, also filters items inside arrays of objects.
   * @default true
   */
  deep?: boolean;
}

// ---------------------------------------------------------------------------
// excludeKeys options
// ---------------------------------------------------------------------------

export interface ExcludeOptions extends BaseFilterOptions {
  /**
   * When true, matching is case-insensitive.
   * @default false
   */
  caseInsensitive?: boolean;
}

// ---------------------------------------------------------------------------
// includeKeys options
// ---------------------------------------------------------------------------

export interface IncludeOptions extends BaseFilterOptions {
  /**
   * When true, matching is case-insensitive.
   * @default false
   */
  caseInsensitive?: boolean;

  /**
   * When true, the output object preserves the original nesting structure
   * for included deep paths. When false, deep paths are included by walking
   * from the root and keeping the matching subtree.
   * @default true
   */
  preserveStructure?: boolean;
}

// ---------------------------------------------------------------------------
// hideIf options
// ---------------------------------------------------------------------------

export interface HideIfOptions extends BaseFilterOptions {
  /**
   * When true, removes the parent key when all its children are removed
   * by the predicate.
   * @default true
   */
  removeEmptyParents?: boolean;
}

// ---------------------------------------------------------------------------
// stripEmpty options
// ---------------------------------------------------------------------------

export interface StripEmptyOptions extends BaseFilterOptions {
  /**
   * Keep `false` boolean values (do not treat them as empty).
   * @default true
   */
  preserveFalse?: boolean;

  /**
   * Keep `0` numeric values (do not treat them as empty).
   * @default true
   */
  preserveZero?: boolean;

  /**
   * Keep empty strings `""`.
   * @default false
   */
  preserveEmptyStrings?: boolean;

  /**
   * Keep empty arrays `[]`.
   * @default false
   */
  preserveEmptyArrays?: boolean;

  /**
   * Keep empty objects `{}`.
   * @default false
   */
  preserveEmptyObjects?: boolean;
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * A compiled path matcher that can test whether a given dot-notation path
 * matches the original pattern.
 */
export interface PathMatcher {
  /** The original pattern string. */
  readonly pattern: string;
  /** Returns true if the given path matches this pattern. */
  matches(path: string): boolean;
  /** Returns true if this is a wildcard / glob pattern. */
  readonly isGlob: boolean;
}

/**
 * Configuration for the path matching engine.
 */
export interface PathMatcherOptions {
  /**
   * When true, matching is case-insensitive.
   * @default false
   */
  caseInsensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Filter result metadata
// ---------------------------------------------------------------------------

/**
 * Metadata returned alongside a filtered result.
 */
export interface FilterResult<T> {
  /** The filtered value. */
  readonly data: T;
  /** Number of keys/fields that were removed. */
  readonly removedCount: number;
  /** Dot-notation paths of removed fields. */
  readonly removedPaths: readonly string[];
}
