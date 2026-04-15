// =============================================================================
// index.ts — @heyblank-labs/json-flux v0.3.0 Public API
//
// Flow, shape, and transform JSON effortlessly.
//
// Tree-shakable: import only what you need.
//   import { flattenObject }       from '@heyblank-labs/json-flux'; // v0.1.0
//   import { toDisplayLabel }      from '@heyblank-labs/json-flux'; // v0.2.0
//   import { excludeKeys, hideIf } from '@heyblank-labs/json-flux'; // v0.3.0
// =============================================================================

// ── v0.1.0 Core functions ─────────────────────────────────────────────────────
export { flattenObject } from "./core/flatten.js";
export { flattenArray, collectRowKeys } from "./core/array.js";
export { removeNulls, isEmpty } from "./core/clean.js";
export { safeParse, deepSafeParse } from "./core/parse.js";
export { collectAllKeys } from "./core/keys.js";
export { extractField, hasField, parsePath } from "./core/extract.js";

// ── v0.1.0 Internal traversal utilities (exported for advanced usage / plugins)
export {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  UNSAFE_KEYS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from "./core/traversal.js";

// ── v0.1.0 General helpers ────────────────────────────────────────────────────
export {
  deepClone,
  deepMerge,
  deepEqual,
  toSafeString,
  omitKeys,
  pickKeys,
} from "./utils/helpers.js";

// ── v0.2.0 Labels layer ───────────────────────────────────────────────────────
export { toDisplayLabel, labelKeys, clearLabelCache } from "./transform/label.js";
export { humanize, humanizeArray } from "./transform/humanize.js";

// ── v0.2.0 Sections layer ─────────────────────────────────────────────────────
export {
  normalizeToSections,
  flattenSectionsToFields,
  mergeSections,
} from "./transform/section.js";

// ── v0.2.0 Utilities ─────────────────────────────────────────────────────────
export {
  BUILT_IN_DICTIONARY,
  lookupDictionary,
  isAcronym,
} from "./utils/dictionary.js";
export {
  tokenize,
  toTitleCase,
  toSentenceCase,
  looksLikeAcronym,
  lastSegment,
  unescapeKey,
} from "./utils/string.js";

// ── v0.3.0 Filtering layer ───────────────────────────────────────────────────
export { excludeKeys, excludeKeysDirect } from "./filter/exclude.js";
export { includeKeys, includeKeysDirect } from "./filter/include.js";
export {
  hideIf,
  hideIfDirect,
  // Built-in predicates
  isNull,
  isNullish,
  isEmptyString,
  isEmptyArray,
  isEmptyObject,
  isFalsy,
} from "./filter/conditional.js";
export { stripEmpty, stripEmptyDirect } from "./filter/strip.js";

// ── v0.3.0 Path matching engine (advanced / plugin use) ─────────────────────
export { compileMatcher, compileMatchers, anyMatcherMatches } from "./filter/matcher.js";

// ── v0.3.0 Path utilities (advanced / plugin use) ───────────────────────────
export {
  splitPath,
  joinPath,
  parentPath,
  leafKey,
  isValidPath,
  pathContainsUnsafeKey,
} from "./utils/path.js";

// ── v0.1.0 Types ──────────────────────────────────────────────────────────────
export type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  FlatRecord,
  FlattenOptions,
  RemoveNullsOptions,
  SafeParseOptions,
  CollectKeysOptions,
  ExtractOptions,
  FlattenResult,
  CollectKeysResult,
} from "./types/index.js";

export type { FlattenArrayResult } from "./core/array.js";

// ── v0.2.0 Types ──────────────────────────────────────────────────────────────
export type {
  FieldType,
  Field,
  Section,
  CaseStyle,
  LabelOptions,
  HumanizeOptions,
  SectionMapping,
  SectionConfig,
  NormalizationResult,
} from "./types/section.types.js";

// ── v0.3.0 Types ──────────────────────────────────────────────────────────────
export type {
  FilterPredicate,
  BaseFilterOptions,
  ExcludeOptions,
  IncludeOptions,
  HideIfOptions,
  StripEmptyOptions,
  PathMatcher,
  PathMatcherOptions,
  FilterResult,
} from "./types/filter.types.js";


