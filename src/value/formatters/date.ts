// =============================================================================
// value/formatters/date.ts
// Formats date values (ISO strings, timestamps, human date strings) into
// configurable display strings without external dependencies.
//
// Supported format tokens:
//   YYYY  → full year (2024)
//   YY    → 2-digit year (24)
//   MMMM  → full month name (January)
//   MMM   → short month name (Jan)
//   MM    → zero-padded month (01–12)
//   M     → unpadded month (1–12)
//   DD    → zero-padded day (01–31)
//   D     → unpadded day (1–31)
//   HH    → 24h hour (00–23)
//   hh    → 12h hour (01–12)
//   mm    → minutes (00–59)
//   ss    → seconds (00–59)
//   A     → AM/PM
//   a     → am/pm
// =============================================================================

import type { DateFormatterOptions } from "../../types/value.types.js";

const DEFAULT_DATE_OPTIONS: Required<DateFormatterOptions> = {
  format: "DD MMM YYYY",
  locale: "en-US",
  fallback: "—",
  timestampMs: true,
};

// Short and long month name tables — keyed by locale-agnostic index
const SHORT_MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
const LONG_MONTHS_EN  = ["January","February","March","April","May","June","July","August","September","October","November","December"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parses any date-like value into a JavaScript Date object.
 * Returns null if parsing fails.
 */
function parseDate(value: unknown, timestampMs: boolean): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    // Distinguish seconds vs milliseconds heuristically
    const ms = timestampMs ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    // Try replacing space-separated datetime (some APIs use "2024-01-15 10:30:00")
    const d2 = new Date(trimmed.replace(" ", "T"));
    return isNaN(d2.getTime()) ? null : d2;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  return null;
}

// Cache month names keyed by locale to avoid Intl construction overhead
const MONTH_NAMES_CACHE = new Map<string, { short: string[]; long: string[] }>();

/**
 * Returns localised month names for the given locale, falling back to English.
 */
function getMonthNames(locale: string): { short: string[]; long: string[] } {
  const cached = MONTH_NAMES_CACHE.get(locale);
  if (cached) return cached;

  try {
    const short: string[] = [];
    const long: string[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(2024, m, 1);
      short.push(d.toLocaleDateString(locale, { month: "short" }));
      long.push(d.toLocaleDateString(locale, { month: "long" }));
    }
    const result = { short, long };
    MONTH_NAMES_CACHE.set(locale, result);
    return result;
  } catch {
    const result = { short: [...SHORT_MONTHS_EN], long: [...LONG_MONTHS_EN] };
    MONTH_NAMES_CACHE.set(locale, result);
    return result;
  }
}

/**
 * Applies the format string to a parsed Date.
 */
function applyFormat(date: Date, format: string, locale: string): string {
  const { short: shortMonths, long: longMonths } = getMonthNames(locale);

  const Y = date.getFullYear();
  const Mo = date.getMonth(); // 0-indexed
  const D = date.getDate();
  const H = date.getHours();
  const Mi = date.getMinutes();
  const S = date.getSeconds();
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const ampm = H < 12 ? "AM" : "PM";

  // Use placeholder substitution to avoid token collisions.
  // Replace tokens → placeholders → final values in one pass.
  const tokens: Array<[RegExp, string]> = [
    [/MMMM/g,       longMonths[Mo]  ?? ""],
    [/MMM/g,        shortMonths[Mo] ?? ""],
    [/MM/g,         pad2(Mo + 1)],
    [/\bM\b/g,      String(Mo + 1)],
    [/YYYY/g,       String(Y)],
    [/YY/g,         String(Y).slice(-2)],
    [/DD/g,         pad2(D)],
    [/\bD\b/g,      String(D)],
    [/HH/g,         pad2(H)],
    [/hh/g,         pad2(h12)],
    [/mm/g,         pad2(Mi)],
    [/ss/g,         pad2(S)],
    [/A/g,          ampm],
    [/a/g,          ampm.toLowerCase()],
  ];

  // Build a safe substitution: replace each token with a numbered placeholder
  // so earlier replacements don't collide with later token patterns.
  let result = format;
  const values: string[] = [];

  for (const [re, val] of tokens) {
    const idx = values.length;
    const placeholder = `\x00${idx}\x00`;
    const replaced = result.replace(re, placeholder);
    if (replaced !== result) {
      values.push(val);
      result = replaced;
    }
  }

  // Substitute placeholders with final values
  for (let i = 0; i < values.length; i++) {
    result = result.replace(`\x00${i}\x00`, values[i] ?? "");
  }

  return result;
}

/**
 * Creates a date formatter function with pre-bound options.
 *
 * @example
 * const fmt = createDateFormatter({ format: "DD MMM YYYY", locale: "en-IN" });
 * fmt("2024-01-15")  // → "15 Jan 2024"
 * fmt(1705276800000) // → "15 Jan 2024"
 */
export function createDateFormatter(
  options: DateFormatterOptions = {}
) {
  const opts: Required<DateFormatterOptions> = { ...DEFAULT_DATE_OPTIONS, ...options };

  return function formatDate(value: unknown): string {
    const date = parseDate(value, opts.timestampMs);
    if (!date) return opts.fallback;
    return applyFormat(date, opts.format, opts.locale);
  };
}

/**
 * Formats a date value using the given options.
 * Convenience wrapper around `createDateFormatter`.
 *
 * @example
 * formatDate("2024-01-15")                              // → "15 Jan 2024"
 * formatDate("2024-01-15", { format: "MMMM D, YYYY" }) // → "January 15, 2024"
 * formatDate(1705276800000, { format: "DD/MM/YYYY" })   // → "15/01/2024"
 * formatDate("invalid")                                 // → "—"
 */
export function formatDate(
  value: unknown,
  options: DateFormatterOptions = {}
): string {
  return createDateFormatter(options)(value);
}
