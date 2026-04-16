// =============================================================================
// value/formatters/boolean.ts
// Formats boolean (and boolean-like) values into configurable display strings.
// Also exports the number formatter for numeric display.
// =============================================================================

import type {
  BooleanFormatterOptions,
  NumberFormatterOptions,
} from "../../types/value.types.js";

// ---------------------------------------------------------------------------
// Boolean formatter
// ---------------------------------------------------------------------------

const DEFAULT_BOOLEAN_OPTIONS: Required<BooleanFormatterOptions> = {
  trueLabel: "Yes",
  falseLabel: "No",
  nullLabel: "—",
};

/**
 * Creates a boolean formatter with pre-bound options.
 *
 * @example
 * const fmt = createBooleanFormatter({ trueLabel: "Active", falseLabel: "Inactive" });
 * fmt(true)   // → "Active"
 * fmt(false)  // → "Inactive"
 * fmt(null)   // → "—"
 */
export function createBooleanFormatter(
  options: BooleanFormatterOptions = {}
) {
  const opts: Required<BooleanFormatterOptions> = { ...DEFAULT_BOOLEAN_OPTIONS, ...options };

  return function formatBoolean(value: unknown): string {
    if (value === null || value === undefined) return opts.nullLabel;

    // Explicit boolean
    if (typeof value === "boolean") {
      return value ? opts.trueLabel : opts.falseLabel;
    }

    // Truthy/falsy string: "true", "false", "yes", "no", "1", "0"
    if (typeof value === "string") {
      const lower = value.toLowerCase().trim();
      if (lower === "true" || lower === "yes" || lower === "1" || lower === "on") {
        return opts.trueLabel;
      }
      if (lower === "false" || lower === "no" || lower === "0" || lower === "off") {
        return opts.falseLabel;
      }
    }

    // Numeric: 1 → true, 0 → false
    if (typeof value === "number") {
      if (value === 1) return opts.trueLabel;
      if (value === 0) return opts.falseLabel;
    }

    return opts.nullLabel;
  };
}

/**
 * Formats a boolean value with the given options.
 *
 * @example
 * formatBoolean(true)                           // → "Yes"
 * formatBoolean(false)                          // → "No"
 * formatBoolean(null)                           // → "—"
 * formatBoolean(true, { trueLabel: "Active" })  // → "Active"
 * formatBoolean("yes")                          // → "Yes"
 * formatBoolean(0)                              // → "No"
 */
export function formatBoolean(
  value: unknown,
  options: BooleanFormatterOptions = {}
): string {
  return createBooleanFormatter(options)(value);
}

// ---------------------------------------------------------------------------
// Number formatter
// ---------------------------------------------------------------------------

const DEFAULT_NUMBER_OPTIONS: Required<NumberFormatterOptions> = {
  locale: "en-US",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  fallback: "—",
};

/**
 * Creates a number formatter with pre-bound options.
 *
 * @example
 * const fmt = createNumberFormatter({ locale: "en-IN", maximumFractionDigits: 0 });
 * fmt(1234567)  // → "12,34,567"
 */
export function createNumberFormatter(
  options: NumberFormatterOptions = {}
) {
  const opts: Required<NumberFormatterOptions> = { ...DEFAULT_NUMBER_OPTIONS, ...options };

  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(opts.locale, {
      minimumFractionDigits: opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits,
    });
  } catch {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits,
    });
  }

  return function formatNumber(value: unknown): string {
    if (value === null || value === undefined) return opts.fallback;

    let n: number;
    if (typeof value === "number") {
      n = value;
    } else if (typeof value === "string") {
      n = Number(value.trim());
    } else {
      return opts.fallback;
    }

    if (isNaN(n) || !isFinite(n)) return opts.fallback;

    try {
      return formatter.format(n);
    } catch {
      return opts.fallback;
    }
  };
}

/**
 * Formats a numeric value with locale-aware thousands separators and decimal control.
 *
 * @example
 * formatNumber(1234567.89)                         // → "1,234,567.89"
 * formatNumber(1234567, { locale: "de-DE" })       // → "1.234.567"
 * formatNumber(42.1, { maximumFractionDigits: 0 }) // → "42"
 */
export function formatNumber(
  value: unknown,
  options: NumberFormatterOptions = {}
): string {
  return createNumberFormatter(options)(value);
}
