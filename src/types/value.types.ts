// =============================================================================
// types/value.types.ts
// All public-facing types for the v0.4.0 Value Transformation layer.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// Transformer function signature
// ---------------------------------------------------------------------------

/**
 * A function that transforms a single value.
 *
 * @param value  - The current field value.
 * @param key    - The raw key at this node (last segment of path).
 * @param path   - Full dot-notation path from root.
 * @param parent - The parent object containing this field (read-only).
 */
export type ValueTransformer = (
  value: JsonValue,
  key: string,
  path: string,
  parent: Readonly<Record<string, JsonValue>>
) => JsonValue;

/**
 * A function that computes a virtual/derived field from the full root object.
 *
 * @param root - The entire root object (read-only, after other transforms).
 * @returns The computed value for the virtual field.
 */
export type ComputedFieldFn = (root: Readonly<Record<string, unknown>>) => JsonValue;

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

/** Auto-detected semantic type of a value. */
export type DetectedType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "array"
  | "object"
  | "date"       // ISO 8601 / common date strings
  | "email"      // RFC-5322 email
  | "url"        // http/https URL
  | "phone"      // international phone number heuristic
  | "currency";  // number with currency-like formatting

export interface TypeDetectionResult {
  readonly type: DetectedType;
  /** Confidence score 0–1. */
  readonly confidence: number;
  /** Normalised value when the type implies a specific format. */
  readonly normalised?: string;
}

// ---------------------------------------------------------------------------
// Built-in formatter options
// ---------------------------------------------------------------------------

/** Options for the date formatter. */
export interface DateFormatterOptions {
  /**
   * Output format tokens (moment-lite syntax):
   *   YYYY  → full year          (2024)
   *   YY    → 2-digit year       (24)
   *   MM    → 2-digit month      (01-12)
   *   MMM   → short month name   (Jan)
   *   MMMM  → full month name    (January)
   *   DD    → 2-digit day        (01-31)
   *   D     → day without pad    (1-31)
   *   HH    → 24h hour           (00-23)
   *   hh    → 12h hour           (01-12)
   *   mm    → minutes            (00-59)
   *   ss    → seconds            (00-59)
   *   A     → AM/PM
   *   a     → am/pm
   * @default "DD MMM YYYY"
   */
  format?: string;

  /**
   * BCP 47 locale tag for month/day names.
   * @default "en-US"
   */
  locale?: string;

  /**
   * Value returned when the input cannot be parsed as a date.
   * @default "—"
   */
  fallback?: string;

  /**
   * When true, treat numeric inputs as Unix timestamps in milliseconds.
   * When false, treat as seconds.
   * @default true
   */
  timestampMs?: boolean;
}

/** Options for the currency formatter. */
export interface CurrencyFormatterOptions {
  /**
   * ISO 4217 currency code.
   * @default "USD"
   */
  currency?: string;

  /**
   * BCP 47 locale tag.
   * @default "en-US"
   */
  locale?: string;

  /**
   * Number of decimal places.
   * @default 2
   */
  decimals?: number;

  /**
   * Value returned when input cannot be parsed as a number.
   * @default "—"
   */
  fallback?: string;

  /**
   * When true, show the currency symbol (e.g. "$").
   * When false, show currency code (e.g. "USD 1,000.00").
   * @default true
   */
  showSymbol?: boolean;
}

/** Options for the boolean formatter. */
export interface BooleanFormatterOptions {
  /**
   * Label for `true`.
   * @default "Yes"
   */
  trueLabel?: string;

  /**
   * Label for `false`.
   * @default "No"
   */
  falseLabel?: string;

  /**
   * Label for null/undefined values.
   * @default "—"
   */
  nullLabel?: string;
}

/** Options for the number formatter. */
export interface NumberFormatterOptions {
  /**
   * BCP 47 locale tag.
   * @default "en-US"
   */
  locale?: string;

  /**
   * Minimum decimal places.
   * @default 0
   */
  minimumFractionDigits?: number;

  /**
   * Maximum decimal places.
   * @default 2
   */
  maximumFractionDigits?: number;

  /**
   * Value returned when input cannot be parsed as a number.
   * @default "—"
   */
  fallback?: string;
}

// ---------------------------------------------------------------------------
// Enum mapping
// ---------------------------------------------------------------------------

/**
 * A map from raw enum value (string) to display label.
 * @example { PENDING: "Pending Approval", APPROVED: "Approved" }
 */
export type EnumMap = Readonly<Record<string, string>>;

export interface EnumFormatterOptions {
  /** The enum value-to-label map. */
  map: EnumMap;
  /**
   * Value returned when the input is not found in the map.
   * @default the original value as a string
   */
  fallback?: string;
  /**
   * When true, matching is case-insensitive.
   * @default false
   */
  caseInsensitive?: boolean;
}

// ---------------------------------------------------------------------------
// transformValues config
// ---------------------------------------------------------------------------

/** Per-path transform configuration — one of several forms. */
export type TransformConfig =
  | ValueTransformer                      // raw function
  | { type: "date"; options?: DateFormatterOptions }
  | { type: "currency"; options?: CurrencyFormatterOptions }
  | { type: "boolean"; options?: BooleanFormatterOptions }
  | { type: "number"; options?: NumberFormatterOptions }
  | { type: "enum"; options: EnumFormatterOptions }
  | { type: "default"; value: JsonValue } // fill missing/null with value
  | { type: "auto" };                     // auto-detect and format

/**
 * Main configuration object for `transformValues`.
 */
export interface TransformValuesConfig {
  /**
   * Map of dot-notation path (or bare key) → TransformConfig.
   * Path patterns (wildcards) are supported: "**.amount", "users[*].dob"
   */
  transforms?: Readonly<Record<string, TransformConfig>>;

  /**
   * Virtual/computed fields to inject into the output.
   * Keys are dot-notation paths of the target field.
   * @example { "user.fullName": (root) => root.user.firstName + " " + root.user.lastName }
   */
  computed?: Readonly<Record<string, ComputedFieldFn>>;

  /**
   * Default values for missing/null fields.
   * @example { "user.name": "N/A", "order.status": "Unknown" }
   */
  defaults?: Readonly<Record<string, JsonValue>>;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;

  /**
   * When true, applies auto-type detection and formatting to all unspecified fields.
   * @default false
   */
  autoFormat?: boolean;
}

/**
 * Result returned by `transformValues`.
 */
export interface TransformResult<T> {
  /** The transformed object. */
  readonly data: T;
  /** Paths that had a transformer applied. */
  readonly transformedPaths: readonly string[];
  /** Paths that received a default value (were null/undefined). */
  readonly defaultedPaths: readonly string[];
  /** Paths of virtual fields that were computed and injected. */
  readonly computedPaths: readonly string[];
}
