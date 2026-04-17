// =============================================================================
// index.ts — @heyblank-labs/json-flux v0.5.0 Public API
//
// Flow, shape, and transform JSON effortlessly.
// Tree-shakable: import only what you need.
// =============================================================================

// ── v0.1.0 Core ──────────────────────────────────────────────────────────────
export { flattenObject } from "./core/flatten.js";
export { flattenArray, collectRowKeys } from "./core/array.js";
export { removeNulls, isEmpty } from "./core/clean.js";
export { safeParse, deepSafeParse } from "./core/parse.js";
export { collectAllKeys } from "./core/keys.js";
export { extractField, hasField, parsePath } from "./core/extract.js";
export {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  UNSAFE_KEYS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from "./core/traversal.js";
export {
  deepClone,
  deepMerge,
  deepEqual,
  toSafeString,
  omitKeys,
  pickKeys,
} from "./utils/helpers.js";

// ── v0.2.0 Labels & Sections ─────────────────────────────────────────────────
export { toDisplayLabel, labelKeys, clearLabelCache } from "./transform/label.js";
export { humanize, humanizeArray } from "./transform/humanize.js";
export { normalizeToSections, flattenSectionsToFields, mergeSections } from "./transform/section.js";
export { BUILT_IN_DICTIONARY, lookupDictionary, isAcronym } from "./utils/dictionary.js";
export { tokenize, toTitleCase, toSentenceCase, looksLikeAcronym, lastSegment, unescapeKey } from "./utils/string.js";

// ── v0.3.0 Filtering ─────────────────────────────────────────────────────────
export { excludeKeys, excludeKeysDirect } from "./filter/exclude.js";
export { includeKeys, includeKeysDirect } from "./filter/include.js";
export { hideIf, hideIfDirect, isNull, isNullish, isEmptyString, isEmptyArray, isEmptyObject, isFalsy } from "./filter/conditional.js";
export { stripEmpty, stripEmptyDirect } from "./filter/strip.js";
export { compileMatcher, compileMatchers, anyMatcherMatches } from "./filter/matcher.js";
export { splitPath, joinPath, parentPath, leafKey, isValidPath, pathContainsUnsafeKey } from "./utils/path.js";

// ── v0.4.0 Value Transformation ──────────────────────────────────────────────
export { transformValues, transformValuesDirect } from "./value/transform.js";
export { applyDefaults } from "./value/defaults.js";
export { injectComputedFields } from "./value/computed.js";
export { detectType, isDateLike, isNumericLike } from "./value/detect.js";
export { formatDate, createDateFormatter } from "./value/formatters/date.js";
export { formatCurrency, createCurrencyFormatter } from "./value/formatters/currency.js";
export { formatBoolean, createBooleanFormatter, formatNumber, createNumberFormatter } from "./value/formatters/boolean.js";
export { formatEnum, createEnumFormatter } from "./value/formatters/enum.js";

// ── v0.5.0 Structural Transformation ─────────────────────────────────────────
export { unflatten, compactSparseArray } from "./structure/unflatten.js";
export { remapObject, remapObjectDirect } from "./structure/remap.js";
export { mergeDeep } from "./structure/merge.js";
export { pivotStructure, arrayToObject, objectToArray } from "./structure/pivot.js";
export { normalizeKeys } from "./structure/normalizeKeys.js";
export { convertKeyCase, convertKey, tokeniseKey, clearCaseCache } from "./utils/case.js";

// ── v0.1.0 Types ──────────────────────────────────────────────────────────────
export type {
  JsonPrimitive, JsonObject, JsonArray, JsonValue, FlatRecord,
  FlattenOptions, RemoveNullsOptions, SafeParseOptions,
  CollectKeysOptions, ExtractOptions, FlattenResult, CollectKeysResult,
} from "./types/index.js";
export type { FlattenArrayResult } from "./core/array.js";

// ── v0.2.0 Types ──────────────────────────────────────────────────────────────
export type {
  FieldType, Field, Section, CaseStyle, LabelOptions,
  HumanizeOptions, SectionMapping, SectionConfig, NormalizationResult,
} from "./types/section.types.js";

// ── v0.3.0 Types ──────────────────────────────────────────────────────────────
export type {
  FilterPredicate, BaseFilterOptions, ExcludeOptions, IncludeOptions,
  HideIfOptions, StripEmptyOptions, PathMatcher, PathMatcherOptions, FilterResult,
} from "./types/filter.types.js";

// ── v0.4.0 Types ──────────────────────────────────────────────────────────────
export type {
  ValueTransformer, ComputedFieldFn, DetectedType, TypeDetectionResult,
  DateFormatterOptions, CurrencyFormatterOptions, BooleanFormatterOptions,
  NumberFormatterOptions, EnumMap, EnumFormatterOptions,
  TransformConfig, TransformValuesConfig, TransformResult,
} from "./types/value.types.js";

// ── v0.5.0 Types ──────────────────────────────────────────────────────────────
export type {
  UnflattenOptions, RemapOptions, MergeDeepOptions,
  ArrayMergeStrategy, PivotOptions, PivotDirection,
  KeyCase, NormalizeKeysOptions, StructureResult,
} from "./types/structure.types.js";
