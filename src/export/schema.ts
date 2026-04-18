// =============================================================================
// export/schema.ts
// Generates JSON Schema (draft-07 / 2019-09 / 2020-12) from JSON values.
//
// Design:
//   • Type inference from actual values — no configuration required.
//   • Array items: all items are analysed and their schemas merged.
//   • Nested objects: recursive with depth guard.
//   • Optional `required` fields, `strict` mode, `examples`.
//   • Pure — no mutation.
//   • Draft $schema URI is always emitted on the root node.
// =============================================================================

import type {
  JsonSchemaOptions,
  JsonSchemaNode,
  JsonSchemaDraft,
} from "../types/export.types.js";
import type { JsonValue } from "../types/index.js";
import { isPlainObject, isUnsafeKey, DEFAULT_MAX_DEPTH } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// Draft → $schema URI mapping
// ---------------------------------------------------------------------------

const DRAFT_URIS: Record<JsonSchemaDraft, string> = {
  "draft-07":      "http://json-schema.org/draft-07/schema#",
  "draft-2019-09": "https://json-schema.org/draft/2019-09/schema",
  "draft-2020-12": "https://json-schema.org/draft/2020-12/schema",
};

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

function inferType(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (isPlainObject(value)) return "object";
  return "string";
}

/** Detect common string formats for the `format` keyword. */
function inferFormat(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "date-time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return "time";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "email";
  if (/^https?:\/\//.test(value)) return "uri";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return "uuid";
  return undefined;
}

// ---------------------------------------------------------------------------
// Schema merging (for array items from multiple samples)
// ---------------------------------------------------------------------------

/**
 * Merges two schema nodes into one that describes both.
 * Used when analysing multiple items in an array.
 */
function mergeSchemas(a: JsonSchemaNode, b: JsonSchemaNode): JsonSchemaNode {
  if (a.type !== b.type) {
    const types: string[] = [];
    if (typeof a.type === "string") types.push(a.type);
    else if (Array.isArray(a.type)) types.push(...a.type as string[]);
    if (typeof b.type === "string" && !types.includes(b.type)) types.push(b.type);
    else if (Array.isArray(b.type)) {
      for (const t of b.type as string[]) {
        if (!types.includes(t)) types.push(t);
      }
    }
    return { type: types } as JsonSchemaNode;
  }

  if (a.type === "object" && b.type === "object") {
    const mergedProperties: Record<string, JsonSchemaNode> = {
      ...(a.properties ?? {}),
    };
    for (const [key, bSchema] of Object.entries(b.properties ?? {})) {
      if (mergedProperties[key]) {
        mergedProperties[key] = mergeSchemas(mergedProperties[key]!, bSchema);
      } else {
        mergedProperties[key] = bSchema;
      }
    }

    // Required: only keep keys present in BOTH schemas
    const aRequired = new Set(a.required ?? []);
    const bRequired = new Set(b.required ?? []);
    const mergedRequired = [...aRequired].filter((k) => bRequired.has(k));

    const result: JsonSchemaNode = { type: "object", properties: mergedProperties };
    if (mergedRequired.length > 0) result.required = mergedRequired;
    return result;
  }

  if (a.type === "array" && b.type === "array") {
    const mergedItems = a.items && b.items
      ? mergeSchemas(a.items, b.items)
      : a.items ?? b.items;
    const arrayResult: JsonSchemaNode = { type: "array" };
    if (mergedItems !== undefined) arrayResult.items = mergedItems;
    return arrayResult;
  }

  // Same primitive type — merge is just the type
  const primitiveResult: JsonSchemaNode = {};
  if (a.type !== undefined) primitiveResult.type = a.type;
  return primitiveResult;
}

// ---------------------------------------------------------------------------
// Core schema generation
// ---------------------------------------------------------------------------

function generateSchema(
  value: unknown,
  opts: Required<JsonSchemaOptions>,
  depth: number
): JsonSchemaNode {
  if (depth > opts.maxDepth) return {};

  const type = inferType(value);

  // ── null ──────────────────────────────────────────────────────────────────
  if (type === "null") {
    return { type: "null" };
  }

  // ── boolean ───────────────────────────────────────────────────────────────
  if (type === "boolean") {
    const schema: JsonSchemaNode = { type: "boolean" };
    if (opts.includeExamples) schema.examples = [value as JsonValue];
    return schema;
  }

  // ── number / integer ──────────────────────────────────────────────────────
  if (type === "number" || type === "integer") {
    const schema: JsonSchemaNode = { type };
    if (opts.includeExamples) schema.examples = [value as JsonValue];
    return schema;
  }

  // ── string ────────────────────────────────────────────────────────────────
  if (type === "string") {
    const schema: JsonSchemaNode = { type: "string" };
    const format = inferFormat(value as string);
    if (format) schema.format = format;
    if (opts.includeExamples && (value as string).length <= 100) {
      schema.examples = [value as JsonValue];
    }
    return schema;
  }

  // ── object ────────────────────────────────────────────────────────────────
  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchemaNode> = {};
    const requiredKeys: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (isUnsafeKey(key)) continue;
      properties[key] = generateSchema(val, opts, depth + 1);
      if (opts.required && val !== null && val !== undefined) {
        requiredKeys.push(key);
      }
    }

    const schema: JsonSchemaNode = { type: "object", properties };
    if (requiredKeys.length > 0) schema.required = requiredKeys;
    if (opts.strict) schema.additionalProperties = false;
    if (opts.title && depth === 0) schema.title = opts.title;
    if (opts.description && depth === 0) schema.description = opts.description;
    return schema;
  }

  // ── array ─────────────────────────────────────────────────────────────────
  if (type === "array") {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return { type: "array", items: {} };
    }

    if (opts.mergeArrayItems) {
      let itemSchema = generateSchema(arr[0], opts, depth + 1);
      for (let i = 1; i < arr.length; i++) {
        const next = generateSchema(arr[i], opts, depth + 1);
        itemSchema = mergeSchemas(itemSchema, next);
      }
      return { type: "array" as const, items: itemSchema };
    } else {
      const items = generateSchema(arr[0], opts, depth + 1);
      return { type: "array" as const, items };
    }
  }

  return {} as JsonSchemaNode;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a JSON Schema from a JSON value.
 *
 * @param data    - Any JSON value to generate a schema from.
 * @param options - Schema generation options.
 * @returns A JsonSchemaNode representing the inferred schema.
 *
 * @example
 * toJSONSchema({ name: "Alice", age: 30, active: true })
 * // → {
 * //   "$schema": "http://json-schema.org/draft-07/schema#",
 * //   "type": "object",
 * //   "properties": {
 * //     "name":   { "type": "string" },
 * //     "age":    { "type": "integer" },
 * //     "active": { "type": "boolean" },
 * //   }
 * // }
 *
 * @example
 * // Array of objects — schemas merged
 * toJSONSchema([
 *   { id: 1, name: "Alice", email: "alice@example.com" },
 *   { id: 2, name: "Bob",   email: "bob@example.com", age: 25 },
 * ], { required: true })
 *
 * @example
 * // Strict mode (no additional properties)
 * toJSONSchema(data, { strict: true, draft: "draft-2020-12" })
 */
export function toJSONSchema(
  data: unknown,
  options: JsonSchemaOptions = {}
): JsonSchemaNode {
  const draft = options.draft ?? "draft-07";

  const opts: Required<JsonSchemaOptions> = {
    draft,
    required: options.required ?? false,
    mergeArrayItems: options.mergeArrayItems ?? true,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    title: options.title ?? "",
    description: options.description ?? "",
    strict: options.strict ?? false,
    includeExamples: options.includeExamples ?? false,
  };

  const schema = generateSchema(data, opts, 0);

  // Attach $schema to root
  return Object.freeze({
    $schema: DRAFT_URIS[draft],
    ...schema,
  }) as JsonSchemaNode;
}

/**
 * Generates a JSON Schema from multiple sample values, merging all observed
 * fields into a comprehensive schema. Useful for analysing API response datasets.
 *
 * @param samples - Multiple JSON values of the same shape to analyse.
 * @param options - Schema generation options.
 *
 * @example
 * toJSONSchemaFromSamples([response1, response2, response3], { required: true })
 */
export function toJSONSchemaFromSamples(
  samples: unknown[],
  options: JsonSchemaOptions = {}
): JsonSchemaNode {
  if (samples.length === 0) return toJSONSchema({}, options);
  if (samples.length === 1) return toJSONSchema(samples[0], options);

  const draft = options.draft ?? "draft-07";
  const opts: Required<JsonSchemaOptions> = {
    draft,
    required: options.required ?? false,
    mergeArrayItems: options.mergeArrayItems ?? true,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    title: options.title ?? "",
    description: options.description ?? "",
    strict: options.strict ?? false,
    includeExamples: options.includeExamples ?? false,
  };

  let merged = generateSchema(samples[0], opts, 0);
  for (let i = 1; i < samples.length; i++) {
    const next = generateSchema(samples[i], opts, 0);
    merged = mergeSchemas(merged, next);
  }

  return Object.freeze({
    $schema: DRAFT_URIS[draft],
    ...merged,
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.description ? { description: opts.description } : {}),
  }) as JsonSchemaNode;
}
