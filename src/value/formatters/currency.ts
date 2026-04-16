// =============================================================================
// value/formatters/currency.ts
// Formats numeric values as localised currency strings using the
// browser/Node Intl.NumberFormat API — zero external dependencies.
// =============================================================================

import type { CurrencyFormatterOptions } from "../../types/value.types.js";

const DEFAULT_CURRENCY_OPTIONS: Required<CurrencyFormatterOptions> = {
  currency: "USD",
  locale: "en-US",
  decimals: 2,
  fallback: "—",
  showSymbol: true,
};

/**
 * Coerces a value to a finite number or returns NaN.
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Strip common formatting: $ 1,234.56 → 1234.56
    const cleaned = value.replace(/[^0-9.\-+eE]/g, "");
    return cleaned ? Number(cleaned) : NaN;
  }
  return NaN;
}

/**
 * Creates a currency formatter function with pre-bound options.
 * Uses `Intl.NumberFormat` for locale-aware formatting.
 *
 * @example
 * const fmt = createCurrencyFormatter({ currency: "INR", locale: "en-IN" });
 * fmt(1500)    // → "₹1,500.00"
 * fmt("1500")  // → "₹1,500.00"
 * fmt("abc")   // → "—"
 */
export function createCurrencyFormatter(
  options: CurrencyFormatterOptions = {}
) {
  const opts: Required<CurrencyFormatterOptions> = { ...DEFAULT_CURRENCY_OPTIONS, ...options };

  // Build Intl formatter once and reuse
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(opts.locale, {
      style: "currency",
      currency: opts.currency,
      minimumFractionDigits: opts.decimals,
      maximumFractionDigits: opts.decimals,
      currencyDisplay: opts.showSymbol ? "symbol" : "code",
    });
  } catch {
    // Fall back to a basic formatter if locale/currency is invalid
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: opts.decimals,
      maximumFractionDigits: opts.decimals,
    });
  }

  return function formatCurrency(value: unknown): string {
    const n = toNumber(value);
    if (isNaN(n) || !isFinite(n)) return opts.fallback;
    try {
      return formatter.format(n);
    } catch {
      return opts.fallback;
    }
  };
}

/**
 * Formats a value as a localised currency string.
 *
 * @example
 * formatCurrency(1500)                                  // → "$1,500.00"
 * formatCurrency(1500, { currency: "INR", locale: "en-IN" }) // → "₹1,500.00"
 * formatCurrency(1500, { currency: "EUR", locale: "de-DE" }) // → "1.500,00 €"
 * formatCurrency("abc")                                // → "—"
 */
export function formatCurrency(
  value: unknown,
  options: CurrencyFormatterOptions = {}
): string {
  return createCurrencyFormatter(options)(value);
}
