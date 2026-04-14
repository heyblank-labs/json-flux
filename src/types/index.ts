// =============================================================================
// types/index.ts
// All public-facing TypeScript types and interfaces for @heyblank-labs/json-flux.
// =============================================================================

/** Any plain JSON-compatible value. */
export type JsonPrimitive = string | number | boolean | null;

/** A plain JSON object (not array, not null). */
export type JsonObject = { [key: string]: JsonValue };

/** A JSON array. */
export type JsonArray = JsonValue[];

/** Any valid JSON value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** A fully flat record of dot-notation paths to primitive values. */
export type FlatRecord = Record<string, JsonPrimitive>;

// ---------------------------------------------------------------------------
// flattenObject / flattenArray options
// ---------------------------------------------------------------------------

export interface FlattenOptions {
  /**
   * Key delimiter. Defaults to ".".
   * @default "."
   */
  delimiter?: string;

  /**
   * Maximum recursion depth. Nodes deeper than this are stringified.
   * Defaults to 20.
   * @default 20
   */
  maxDepth?: number;

  /**
   * When true, arrays are stored as JSON strings at their path rather
   * than being traversed with index-based keys.
   * @default false
   */
  skipArrays?: boolean;

  /**
   * Keys to completely ignore during traversal.
   * @default []
   */
  excludeKeys?: readonly string[];
}

// ---------------------------------------------------------------------------
// removeNulls options
// ---------------------------------------------------------------------------

export interface RemoveNullsOptions {
  /**
   * Also remove empty strings ("").
   * @default true
   */
  removeEmptyStrings?: boolean;

  /**
   * Also remove empty arrays ([]).
   * @default false
   */
  removeEmptyArrays?: boolean;

  /**
   * Also remove empty objects ({}).
   * @default true
   */
  removeEmptyObjects?: boolean;

  /**
   * Maximum recursion depth guard.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// deepSafeParse options
// ---------------------------------------------------------------------------

export interface SafeParseOptions {
  /**
   * Maximum number of unwrapping iterations for double-serialized JSON.
   * @default 10
   */
  maxIterations?: number;

  /**
   * Maximum recursion depth for deep traversal.
   * @default 20
   */
  maxDepth?: number;

  /**
   * If true, throws on prototype-pollution attempts.
   * If false (default), silently drops the offending key.
   * @default false
   */
  throwOnPollution?: boolean;
}

// ---------------------------------------------------------------------------
// collectAllKeys options
// ---------------------------------------------------------------------------

export interface CollectKeysOptions {
  /**
   * When true, returns dot-notation paths instead of bare key names.
   * @default false
   */
  dotNotation?: boolean;

  /**
   * Key delimiter used when dotNotation is true.
   * @default "."
   */
  delimiter?: string;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// extractField options
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  /**
   * Value returned when the path is not found or the target is undefined.
   */
  defaultValue?: JsonValue;
}

// ---------------------------------------------------------------------------
// Result wrappers
// ---------------------------------------------------------------------------

/**
 * Wraps a flatten operation result with contextual metadata.
 */
export interface FlattenResult {
  /** The flattened dot-notation record. */
  readonly data: FlatRecord;
  /** Total number of leaf nodes written. */
  readonly leafCount: number;
  /** Maximum depth reached during traversal. */
  readonly maxDepthReached: number;
  /** Paths that contained arrays of objects (not flattened further). */
  readonly arrayObjectPaths: readonly string[];
}

/**
 * Result from collectAllKeys.
 */
export interface CollectKeysResult {
  /** Unique key names (or paths, if dotNotation is true). */
  readonly keys: readonly string[];
  /** Total number of nodes visited. */
  readonly totalNodes: number;
}
