// =============================================================================
// types/section.types.ts
// All public-facing types for the v0.2.0 Labels & Sections layer.
// Pure data shapes — no UI, no rendering, no framework assumptions.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// Field — the atomic unit of a section
// ---------------------------------------------------------------------------

/** The display type of a field — used by consumers to decide rendering hints. */
export type FieldType =
  | "primitive"   // string, number, boolean
  | "array"       // array of primitives
  | "object"      // nested object (stored as reference, not flattened)
  | "null";       // explicitly null / missing

/**
 * A single label-value pair with full traceability back to the source JSON.
 */
export interface Field {
  /** Human-readable display label, e.g. "First Name". */
  readonly label: string;
  /** The raw value at this path. */
  readonly value: JsonValue;
  /** Dot-notation path from the root, e.g. "user.address.city". */
  readonly path: string;
  /** The raw key at this node, e.g. "city". */
  readonly key: string;
  /** Value type hint for consumer rendering decisions. */
  readonly type: FieldType;
  /** Optional tooltip / description from metadata config. */
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Section — a logical grouping of fields
// ---------------------------------------------------------------------------

/**
 * A named group of fields, optionally containing child sections.
 * Maps directly to an accordion panel, card, or form section in any UI.
 */
export interface Section {
  /** Human-readable section title, e.g. "User Info". */
  readonly title: string;
  /** Flat list of fields directly in this section. */
  readonly fields: readonly Field[];
  /** Nested child sections (for deeply nested JSON). */
  readonly subsections: readonly Section[];
  /** The dot-notation path prefix for this section, e.g. "user.address". */
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Label options
// ---------------------------------------------------------------------------

export type CaseStyle = "title" | "sentence";

/**
 * Options for `toDisplayLabel`.
 */
export interface LabelOptions {
  /**
   * Title case: "First Name". Sentence case: "First name".
   * @default "title"
   */
  caseStyle?: CaseStyle;

  /**
   * When true, keeps recognised uppercase sequences intact: "userID" → "User ID".
   * When false, treats every uppercase run as a word boundary only.
   * @default true
   */
  preserveAcronyms?: boolean;

  /**
   * Custom dictionary for specific key → label overrides evaluated first.
   * Keys are matched case-insensitively.
   * @example { dob: "Date of Birth", id: "ID" }
   */
  dictionary?: Readonly<Record<string, string>>;

  /**
   * Key delimiter used when the path is passed instead of a bare key.
   * Only the last segment is labelled.
   * @default "."
   */
  delimiter?: string;
}

// ---------------------------------------------------------------------------
// Humanize options
// ---------------------------------------------------------------------------

/**
 * Options for `humanize`.
 */
export interface HumanizeOptions {
  /**
   * When true, processes nested objects recursively.
   * @default true
   */
  deep?: boolean;

  /**
   * When true, flattens the output to a single level using dot-notation keys.
   * The keys themselves are still humanized.
   * @default false
   */
  flatten?: boolean;

  /**
   * Explicit key → label overrides applied before any automatic conversion.
   */
  labels?: Readonly<Record<string, string>>;

  /** Passed through to `toDisplayLabel`. */
  labelOptions?: LabelOptions;
}

// ---------------------------------------------------------------------------
// NormalizeToSections config
// ---------------------------------------------------------------------------

/**
 * Per-section configuration entry for explicit section mapping.
 */
export interface SectionMapping {
  /** Override the section title. */
  title?: string;
  /** Override the description/tooltip for the section header. */
  description?: string;
  /**
   * Fields to explicitly include in this section (by key).
   * If omitted, all fields in the matched key are included.
   */
  includeFields?: readonly string[];
  /**
   * Fields to exclude from this section.
   */
  excludeFields?: readonly string[];
}

/**
 * Configuration for `normalizeToSections`.
 */
export interface SectionConfig {
  /**
   * Map from source key (or dot-notation path prefix) to section config.
   * @example { user: { title: "User Info" }, "user.address": { title: "Address" } }
   */
  sectionMap?: Readonly<Record<string, SectionMapping | string>>;

  /**
   * Keys to exclude entirely from output.
   */
  excludeKeys?: readonly string[];

  /**
   * Keys to include (whitelist). All other keys are excluded.
   * When undefined or empty, all keys are included.
   */
  includeKeys?: readonly string[];

  /**
   * Explicit label overrides — same as `LabelOptions.dictionary`.
   */
  labels?: Readonly<Record<string, string>>;

  /** Options passed to the label generator. */
  labelOptions?: LabelOptions;

  /**
   * Maximum recursion depth for nested objects.
   * @default 20
   */
  maxDepth?: number;

  /**
   * When true, fields with null values are included in output sections.
   * @default false
   */
  includeNulls?: boolean;

  /**
   * Optional metadata dictionary: key → description string.
   * Descriptions are attached to Field.description.
   */
  descriptions?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// normalizeToSections result
// ---------------------------------------------------------------------------

export interface NormalizationResult {
  /** The ordered array of top-level sections. */
  readonly sections: readonly Section[];
  /** Total number of Field instances across all sections (recursive). */
  readonly totalFields: number;
  /** All dot-notation paths that were processed. */
  readonly processedPaths: readonly string[];
}
