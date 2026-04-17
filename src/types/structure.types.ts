// =============================================================================
// types/structure.types.ts
// All public-facing types for the v0.5.0 Structural Transformation layer.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// unflatten
// ---------------------------------------------------------------------------

export interface UnflattenOptions {
  /**
   * Delimiter used in flat keys.
   * @default "."
   */
  delimiter?: string;

  /**
   * When true, numeric bracket segments (e.g. "[0]") reconstruct arrays.
   * When false, all segments produce plain objects.
   * @default true
   */
  parseArrays?: boolean;

  /**
   * Maximum depth of the reconstructed structure.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// remapObject
// ---------------------------------------------------------------------------

export interface RemapOptions {
  /**
   * When true, keys not listed in the mapping are carried over to the output.
   * When false (default), only explicitly mapped fields appear in the output.
   * @default false
   */
  keepUnmapped?: boolean;

  /**
   * Value used when a source path does not exist in the input.
   * @default undefined (field is omitted)
   */
  defaultValue?: JsonValue;

  /**
   * Maximum recursion depth for reading source paths.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// mergeDeep
// ---------------------------------------------------------------------------

export type ArrayMergeStrategy = "replace" | "concat" | "unique";

export interface MergeDeepOptions {
  /**
   * How to merge arrays when both target and source have an array at the same path.
   *   "replace" — source array replaces target array entirely (default)
   *   "concat"  — arrays are concatenated (target + source)
   *   "unique"  — arrays are concatenated and deduplicated (by JSON equality)
   * @default "replace"
   */
  arrayStrategy?: ArrayMergeStrategy;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// pivotStructure
// ---------------------------------------------------------------------------

export type PivotDirection = "arrayToObject" | "objectToArray";

export interface PivotOptions {
  /**
   * The field in each array item to use as the key in the output object.
   * Required for "arrayToObject" direction.
   * @example "id" — uses item.id as the output key
   */
  keyField?: string;

  /**
   * When converting objectToArray, the key name to store the original key.
   * @default "key"
   */
  keyName?: string;

  /**
   * When converting objectToArray, the key name to store the value.
   * Only used when the value is a primitive.
   * @default "value"
   */
  valueName?: string;

  /**
   * Maximum depth for nested pivots.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// normalizeKeys
// ---------------------------------------------------------------------------

export type KeyCase = "camel" | "snake" | "pascal" | "kebab";

export interface NormalizeKeysOptions {
  /**
   * Target key case format.
   * @default "camel"
   */
  case?: KeyCase;

  /**
   * When true, recurse into nested objects and arrays.
   * @default true
   */
  deep?: boolean;

  /**
   * When true, preserves known acronyms (ID, API, HTTP…) in appropriate casing.
   * e.g. "userID" → camel → "userID" (not "userId")
   * @default false
   */
  preserveAcronyms?: boolean;

  /**
   * Explicit key overrides applied before any automatic conversion.
   * @example { "user_id": "userId", "api_key": "apiKey" }
   */
  customMap?: Readonly<Record<string, string>>;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface StructureResult<T> {
  /** The transformed value. */
  readonly data: T;
  /** Number of keys/paths that were modified. */
  readonly modifiedCount: number;
}
