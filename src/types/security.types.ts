// =============================================================================
// types/security.types.ts
// All public-facing types for the v0.6.0 Masking & Security layer.
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// Masking modes
// ---------------------------------------------------------------------------

export type MaskMode = "full" | "partial" | "hash" | "custom";

/**
 * A custom masking function that transforms a sensitive value.
 * @param value - The original sensitive value (as a string for safe handling).
 * @param key   - The raw key at this node.
 * @param path  - Full dot-notation path from root.
 */
export type CustomMaskFn = (value: string, key: string, path: string) => string;

// ---------------------------------------------------------------------------
// PII detection
// ---------------------------------------------------------------------------

export type PiiCategory =
  | "email"
  | "phone"
  | "password"
  | "token"
  | "apiKey"
  | "creditCard"
  | "ssn"
  | "ipAddress"
  | "uuid"
  | "name"
  | "url"
  | "custom";

export interface PiiDetectionResult {
  /** Whether this field/value is considered sensitive. */
  readonly isSensitive: boolean;
  /** The detected PII category (if any). */
  readonly category?: PiiCategory;
  /** 0–1 confidence score. */
  readonly confidence: number;
  /** Whether detection was triggered by the key name. */
  readonly detectedByKey: boolean;
  /** Whether detection was triggered by the value content. */
  readonly detectedByValue: boolean;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export type AuditAction = "masked" | "redacted" | "detected" | "skipped";

export interface AuditEntry {
  /** Dot-notation path to the field. */
  readonly path: string;
  /** The raw key at this node. */
  readonly key: string;
  /** What was done to this field. */
  readonly action: AuditAction;
  /** Masking mode applied (when action is "masked"). */
  readonly mode?: MaskMode;
  /** PII category that triggered the action. */
  readonly category?: PiiCategory;
  /** Confidence score of detection. */
  readonly confidence?: number;
}

// ---------------------------------------------------------------------------
// maskSensitive config
// ---------------------------------------------------------------------------

export interface FieldMaskConfig {
  /**
   * Dot-notation paths or bare key names to mask.
   * Wildcard patterns (*, **) are supported.
   * @example ["user.email", "**.password", "users[*].ssn"]
   */
  fields?: readonly string[];

  /**
   * Masking mode to apply.
   * @default "full"
   */
  mode?: MaskMode;

  /**
   * Custom masking function (only used when mode is "custom").
   */
  customMask?: CustomMaskFn;

  /**
   * When true, auto-detect PII in key names and values.
   * @default false
   */
  autoDetect?: boolean;

  /**
   * Minimum confidence threshold for auto-detection (0–1).
   * Fields below this threshold are not auto-masked.
   * @default 0.8
   */
  autoDetectThreshold?: number;

  /**
   * PII categories to auto-detect. When undefined, all categories are checked.
   */
  autoDetectCategories?: readonly PiiCategory[];

  /**
   * When true, record every mask/redact operation in an audit trail.
   * @default false
   */
  audit?: boolean;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;

  /**
   * Character used for full masking.
   * @default "*"
   */
  maskChar?: string;
}

// ---------------------------------------------------------------------------
// maskSensitive result
// ---------------------------------------------------------------------------

export interface MaskResult<T> {
  /** The masked object — original values are never stored. */
  readonly data: T;
  /** Audit trail (populated when config.audit is true). */
  readonly auditTrail: readonly AuditEntry[];
  /** Total number of fields that were masked or redacted. */
  readonly maskedCount: number;
}

// ---------------------------------------------------------------------------
// maskByPattern config
// ---------------------------------------------------------------------------

export interface PatternMaskConfig {
  /**
   * Named patterns to match against string values.
   * Key = label (for audit), value = RegExp.
   */
  patterns: Readonly<Record<string, RegExp>>;

  /**
   * Masking mode to apply to matched values.
   * @default "full"
   */
  mode?: MaskMode;

  /**
   * Custom masking function (mode = "custom").
   */
  customMask?: CustomMaskFn;

  /**
   * When true, only the matched portion of the string is masked.
   * When false, the entire field value is masked.
   * @default false
   */
  maskMatchOnly?: boolean;

  /**
   * Record operations in audit trail.
   * @default false
   */
  audit?: boolean;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;

  /**
   * Character for full masking.
   * @default "*"
   */
  maskChar?: string;
}

// ---------------------------------------------------------------------------
// safeClone config
// ---------------------------------------------------------------------------

export interface SafeCloneOptions {
  /**
   * Fields to mask in the clone.
   */
  maskFields?: readonly string[];

  /**
   * Fields to redact entirely from the clone.
   */
  redactFields?: readonly string[];

  /**
   * Masking mode for masked fields.
   * @default "full"
   */
  mode?: MaskMode;

  /**
   * When true, auto-detect and mask PII.
   * @default false
   */
  autoDetect?: boolean;

  /**
   * Maximum recursion depth.
   * @default 20
   */
  maxDepth?: number;
}
