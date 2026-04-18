// =============================================================================
// types/export.types.ts
// All public-facing types for the v0.7.0 Export layer (CSV + JSON Schema).
// =============================================================================

import type { JsonValue } from "./index.js";

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Definition of a single CSV column.
 */
export interface CsvColumn {
  /**
   * Dot-notation path or bare key to extract from each row.
   * Supports nested paths: "user.address.city"
   */
  key: string;

  /**
   * Header label for this column.
   * Defaults to the humanized version of `key` (using v0.2 labelKeys).
   */
  label?: string;

  /**
   * Custom value transformer applied before CSV escaping.
   * @param value - The extracted value.
   * @param row   - The full flat row record.
   */
  transform?: (value: JsonValue, row: Readonly<Record<string, JsonValue>>) => string;

  /**
   * Default value when the field is missing or null.
   * @default ""
   */
  defaultValue?: string;
}

/**
 * Options for `toCSV`.
 */
export interface CsvOptions {
  /**
   * Column definitions — controls which fields appear and their order.
   * When omitted, all keys from the first row are used in insertion order.
   */
  columns?: CsvColumn[];

  /**
   * Field delimiter.
   * @default ","
   */
  delimiter?: string;

  /**
   * Row terminator.
   * @default "\n"
   */
  lineBreak?: "\n" | "\r\n";

  /**
   * When true, the first row of the output is the header row.
   * @default true
   */
  includeHeader?: boolean;

  /**
   * When true, use v0.2 `toDisplayLabel` to auto-generate column headers
   * for columns that don't have an explicit `label`.
   * @default true
   */
  humanizeHeaders?: boolean;

  /**
   * When true, apply CSV injection prevention:
   * values starting with =, +, -, @, \t, \r are prefixed with a tab character.
   * @default true
   */
  preventInjection?: boolean;

  /**
   * Quote character used to wrap fields containing special characters.
   * @default '"'
   */
  quoteChar?: string;

  /**
   * When true, automatically flatten nested objects.
   * When false, nested objects are JSON-stringified.
   * @default true
   */
  flatten?: boolean;

  /**
   * Maximum depth for nested object flattening.
   * @default 20
   */
  maxDepth?: number;
}

/**
 * Result returned by `toCSV`.
 */
export interface CsvResult {
  /** The full CSV string. */
  readonly csv: string;
  /** Number of data rows (excluding header). */
  readonly rowCount: number;
  /** Column keys that appeared in the output. */
  readonly columns: readonly string[];
}

// ---------------------------------------------------------------------------
// JSON Schema export
// ---------------------------------------------------------------------------

/** Supported JSON Schema draft version. */
export type JsonSchemaDraft =
  | "draft-07"
  | "draft-2019-09"
  | "draft-2020-12";

/**
 * Options for `toJSONSchema`.
 */
export interface JsonSchemaOptions {
  /**
   * JSON Schema draft version to target.
   * @default "draft-07"
   */
  draft?: JsonSchemaDraft;

  /**
   * When true, all detected keys in objects are added to the `required` array.
   * @default false
   */
  required?: boolean;

  /**
   * When generating schema from an array of objects, merge all item schemas
   * to produce a comprehensive schema covering all observed fields.
   * @default true
   */
  mergeArrayItems?: boolean;

  /**
   * Maximum depth for nested schema generation.
   * @default 20
   */
  maxDepth?: number;

  /**
   * Optional title for the root schema object.
   */
  title?: string;

  /**
   * Optional description for the root schema object.
   */
  description?: string;

  /**
   * When true, adds `"additionalProperties": false` to all object schemas.
   * @default false
   */
  strict?: boolean;

  /**
   * When true, includes `"examples"` in the schema using sampled values.
   * @default false
   */
  includeExamples?: boolean;
}

/**
 * A generated JSON Schema node.
 * Intentionally broader than a strict type to accommodate all draft variants.
 */
export interface JsonSchemaNode {
  $schema?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  examples?: JsonValue[];
  enum?: JsonValue[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}
