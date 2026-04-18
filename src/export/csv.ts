// =============================================================================
// export/csv.ts
// Converts JSON data (arrays of objects or single objects) into CSV strings.
//
// Design:
//   • Reuses flattenObject (v0.1) for nested → flat conversion.
//   • Reuses extractField (v0.1) for per-column value extraction.
//   • Reuses toDisplayLabel (v0.2) for auto-generated headers.
//   • CSV injection prevention (OWASP-recommended prefix approach).
//   • Proper RFC-4180 quoting: fields with delimiter/quote/newline are wrapped.
//   • Pure — no mutation, no side effects.
//   • No streaming — returns a complete string; suitable for up to ~100k rows.
// =============================================================================

import type { CsvOptions, CsvResult, CsvColumn } from "../types/export.types.js";
import type { JsonValue, FlatRecord } from "../types/index.js";
import { flattenObject } from "../core/flatten.js";
import { extractField } from "../core/extract.js";
import { isPlainObject } from "../core/traversal.js";
import { toDisplayLabel } from "../transform/label.js";

// ---------------------------------------------------------------------------
// CSV injection prevention
// ---------------------------------------------------------------------------

/** Characters that trigger CSV injection when they start a cell value. */
const INJECTION_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Prefixes a potentially dangerous value with a single-quote to neutralise
 * CSV formula injection, following OWASP recommendations.
 */
function preventInjection(value: string): string {
  if (value.length > 0 && INJECTION_CHARS.has(value.charAt(0))) {
    return `'${value}`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// RFC-4180 field escaping
// ---------------------------------------------------------------------------

/**
 * Escapes a cell value per RFC-4180:
 *  • If the value contains the delimiter, quote char, or line endings → wrap in quotes.
 *  • Double any quote characters inside the quoted field.
 */
function escapeCell(
  value: string,
  delimiter: string,
  quoteChar: string,
  lineBreak: string
): string {
  // Normalise: replace CRLF/LF inside value to a single space for safety
  const normalised = value.replace(/\r\n|\r|\n/g, " ");

  const needsQuoting =
    normalised.includes(delimiter) ||
    normalised.includes(quoteChar) ||
    normalised.includes("\n") ||
    normalised.includes("\r");

  if (needsQuoting) {
    const escaped = normalised.split(quoteChar).join(quoteChar + quoteChar);
    return `${quoteChar}${escaped}${quoteChar}`;
  }

  return normalised;
}

// ---------------------------------------------------------------------------
// Value serialisation
// ---------------------------------------------------------------------------

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    // Primitive arrays → comma-joined
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return value.map((v) => (v === null ? "" : String(v))).join(", ");
    }
    return JSON.stringify(value);
  }
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Flatten input to array of flat rows
// ---------------------------------------------------------------------------

function toFlatRows(
  data: unknown,
  flatten: boolean,
  maxDepth: number
): { rows: FlatRecord[]; allKeys: string[] } {
  let items: unknown[];

  if (Array.isArray(data)) {
    items = data;
  } else if (isPlainObject(data)) {
    items = [data];
  } else {
    return { rows: [], allKeys: [] };
  }

  const rows: FlatRecord[] = [];
  const keySet = new Set<string>();

  for (const item of items) {
    if (!isPlainObject(item)) continue;

    let row: FlatRecord;
    if (flatten) {
      row = flattenObject(item as Record<string, unknown>, { maxDepth }).data;
    } else {
      // Shallow: stringify only nested objects/arrays, keep primitives as-is
      const shallowRow: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        if (isPlainObject(v) || Array.isArray(v)) {
          shallowRow[k] = JSON.stringify(v) as unknown as JsonValue;
        } else {
          shallowRow[k] = v as JsonValue;
        }
      }
      row = shallowRow as FlatRecord;
    }

    rows.push(row);
    Object.keys(row).forEach((k) => keySet.add(k));
  }

  return { rows, allKeys: Array.from(keySet) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts JSON data into a CSV string.
 *
 * @param data    - An array of objects, or a single object.
 * @param options - CSV export configuration.
 * @returns A CsvResult with the CSV string, row count, and column list.
 *
 * @example
 * toCSV([
 *   { name: "Alice", age: 30, city: "London" },
 *   { name: "Bob",   age: 25, city: "Birmingham"  },
 * ])
 * // → "Name,Age,City\nAlice,30,London\nBob,25,Birmingham"
 *
 * @example
 * // Nested object with explicit columns
 * toCSV(data, {
 *   columns: [
 *     { key: "user.name",  label: "Name" },
 *     { key: "user.email", label: "Email" },
 *   ],
 *   delimiter: ";",
 * })
 *
 * @example
 * // Tab-delimited
 * toCSV(data, { delimiter: "\t" })
 */
export function toCSV(data: unknown, options: CsvOptions = {}): CsvResult {
  const {
    columns,
    delimiter = ",",
    lineBreak = "\n",
    includeHeader = true,
    humanizeHeaders = true,
    preventInjection: doPreventInjection = true,
    quoteChar = '"',
    flatten: doFlatten = true,
    maxDepth = 20,
  } = options;

  // ── Step 1: Flatten input to rows ────────────────────────────────────────
  const { rows, allKeys } = toFlatRows(data, doFlatten, maxDepth);

  if (rows.length === 0) {
    return Object.freeze<CsvResult>({ csv: "", rowCount: 0, columns: [] });
  }

  // ── Step 2: Resolve column definitions ──────────────────────────────────
  let resolvedColumns: CsvColumn[];

  if (columns && columns.length > 0) {
    resolvedColumns = columns;
  } else {
    // Auto-discover from all row keys
    resolvedColumns = allKeys.map((k) => ({ key: k }));
  }

  const outputColumnKeys = resolvedColumns.map((c) => c.key);

  // ── Step 3: Build header row ─────────────────────────────────────────────
  const lines: string[] = [];

  if (includeHeader) {
    const headerCells = resolvedColumns.map((col) => {
      const label = col.label ?? (humanizeHeaders ? toDisplayLabel(col.key) : col.key);
      return escapeCell(label, delimiter, quoteChar, lineBreak);
    });
    lines.push(headerCells.join(delimiter));
  }

  // ── Step 4: Build data rows ──────────────────────────────────────────────
  for (const row of rows) {
    const cells = resolvedColumns.map((col) => {
      // Extract value: try flat row first, then deep extraction
      let rawValue: unknown = row[col.key];
      if (rawValue === undefined) {
        // Try extracting from original nested object via path
        rawValue = extractField(row, col.key);
      }

      // Apply column transform if provided
      let strValue: string;
      if (col.transform) {
        try {
          strValue = col.transform(rawValue as JsonValue, row);
        } catch {
          strValue = "";
        }
      } else {
        strValue = rawValue !== undefined && rawValue !== null
          ? valueToString(rawValue)
          : (col.defaultValue ?? "");
      }

      // CSV injection prevention
      if (doPreventInjection) {
        strValue = preventInjection(strValue);
      }

      // RFC-4180 escaping
      return escapeCell(strValue, delimiter, quoteChar, lineBreak);
    });

    lines.push(cells.join(delimiter));
  }

  return Object.freeze<CsvResult>({
    csv: lines.join(lineBreak),
    rowCount: rows.length,
    columns: Object.freeze(outputColumnKeys),
  });
}

/**
 * Convenience variant — returns the CSV string directly.
 *
 * @example
 * const csv = toCsvString(data, { delimiter: ";" });
 */
export function toCsvString(data: unknown, options: CsvOptions = {}): string {
  return toCSV(data, options).csv;
}
