// =============================================================================
// index.ts — @heyblank-labs/json-flux v0.1.0 Public API
//
// Flow, shape, and transform JSON effortlessly.
//
// Tree-shakable: import only what you need.
//   import { flattenObject } from '@heyblank-labs/json-flux';
//   import { extractField } from '@heyblank-labs/json-flux';
// =============================================================================

// ── Core functions ────────────────────────────────────────────────────────────
export { flattenObject } from "./core/flatten.js";
export { flattenArray, collectRowKeys } from "./core/array.js";
export { removeNulls, isEmpty } from "./core/clean.js";
export { safeParse, deepSafeParse } from "./core/parse.js";
export { collectAllKeys } from "./core/keys.js";
export { extractField, hasField, parsePath } from "./core/extract.js";

// ── Internal traversal utilities (exported for advanced usage / plugins) ─────
export {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  UNSAFE_KEYS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from "./core/traversal.js";

// ── General helpers ───────────────────────────────────────────────────────────
export {
  deepClone,
  deepMerge,
  deepEqual,
  toSafeString,
  omitKeys,
  pickKeys,
} from "./utils/helpers.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // Value types
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  FlatRecord,
  // Options
  FlattenOptions,
  RemoveNullsOptions,
  SafeParseOptions,
  CollectKeysOptions,
  ExtractOptions,
  // Results
  FlattenResult,
  CollectKeysResult,
} from "./types/index.js";

export type { FlattenArrayResult } from "./core/array.js";
