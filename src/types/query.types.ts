// =============================================================================
// types/query.types.ts
// All public-facing types for the v0.8.0 Query, Search & Aggregation layer.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// Where / filter operators
// ---------------------------------------------------------------------------

export type WhereOperator =
  | "eq"       // ===
  | "ne"       // !==
  | "gt"       // >
  | "gte"      // >=
  | "lt"       // <
  | "lte"      // <=
  | "in"       // value in array
  | "contains" // string/array contains
  | ">"  | ">=" | "<" | "<=" | "=" | "!=" | "=="; // shorthand aliases

/** A predicate function used with where(). */
export type WherePredicate<T> = (item: T, index: number) => boolean;

/** A selector/key extractor function. */
export type KeySelector<T, K> = (item: T) => K;

/** A value projector function used with select(). */
export type Projector<T, R> = (item: T, index: number) => R;

// ---------------------------------------------------------------------------
// Group result
// ---------------------------------------------------------------------------

export interface GroupResult<K, T> {
  /** The group key. */
  readonly key: K;
  /** Items in this group. */
  readonly items: readonly T[];
  /** Item count in this group. */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Search result
// ---------------------------------------------------------------------------

export interface SearchMatch {
  /** Dot-notation path to the matched value. */
  readonly path: string;
  /** The matched value. */
  readonly value: JsonValue;
  /** The raw key at this node. */
  readonly key: string;
  /** The matching keyword. */
  readonly keyword: string;
}

export interface SearchOptions {
  /**
   * When true, the keyword must appear as a whole word.
   * @default false
   */
  wholeWord?: boolean;

  /**
   * When true, only search string values (skip numbers, booleans).
   * @default false
   */
  stringsOnly?: boolean;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;

  /**
   * Maximum number of matches to return.
   * @default Infinity
   */
  limit?: number;
}

// ---------------------------------------------------------------------------
// JSONPath result
// ---------------------------------------------------------------------------

export interface JsonPathResult {
  /** The matched value. */
  readonly value: unknown;
  /** Dot-notation path to the value. */
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Query result
// ---------------------------------------------------------------------------

export interface QueryResult<T> {
  /** Execute the pipeline and return items as an array. */
  toArray(): T[];

  /** Execute and return the first item, or undefined. */
  first(): T | undefined;

  /** Execute and return the last item, or undefined. */
  last(): T | undefined;

  /** Execute and return the count of items. */
  count(): number;

  /** Execute and return true if any items match. */
  any(): boolean;

  /** Execute and return true if all items match the given predicate. */
  all(predicate: WherePredicate<T>): boolean;
}
