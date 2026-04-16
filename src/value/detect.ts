// =============================================================================
// value/detect.ts
// Auto-detects the semantic type of a JSON value.
//
// Used by:
//   • transformValues() with autoFormat: true
//   • The detectType() public API for inspection
//
// Design:
//   • Zero regex compilation overhead — patterns are module-level constants.
//   • Returns confidence score so consumers can make soft decisions.
//   • Never throws — always returns a result.
// =============================================================================

import type { DetectedType, TypeDetectionResult } from "../types/value.types.js";

// ---------------------------------------------------------------------------
// Pre-compiled patterns (module-level, compiled once)
// ---------------------------------------------------------------------------

// ISO 8601 date-like: 2024-01-15, 2024-01-15T10:30:00Z, etc.
const DATE_RE =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// Common human date: 01/15/2024, 15-Jan-2024, etc.
const HUMAN_DATE_RE =
  /^(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})$/i;

// RFC-5322 simplified email
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// HTTP/HTTPS URL
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

// International phone heuristic: +91-9876543210, (800) 555-1234, etc.
const PHONE_RE =
  /^(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}(?:[-.\s]?\d{1,9})?$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects the semantic type of a JSON value with a confidence score.
 *
 * @param value - Any JSON-compatible value.
 * @returns A TypeDetectionResult describing the detected type.
 *
 * @example
 * detectType("2024-01-15")          // → { type: "date", confidence: 0.95 }
 * detectType("alice@example.com")   // → { type: "email", confidence: 0.9 }
 * detectType(true)                  // → { type: "boolean", confidence: 1 }
 * detectType(42.5)                  // → { type: "number", confidence: 1 }
 * detectType(null)                  // → { type: "null", confidence: 1 }
 */
export function detectType(value: unknown): TypeDetectionResult {
  // ── Null ────────────────────────────────────────────────────────────────────
  if (value === null || value === undefined) {
    return { type: "null", confidence: 1 };
  }

  // ── Boolean ─────────────────────────────────────────────────────────────────
  if (typeof value === "boolean") {
    return { type: "boolean", confidence: 1 };
  }

  // ── Number ──────────────────────────────────────────────────────────────────
  if (typeof value === "number") {
    return { type: "number", confidence: 1 };
  }

  // ── Array ───────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    return { type: "array", confidence: 1 };
  }

  // ── Plain object ─────────────────────────────────────────────────────────────
  if (typeof value === "object") {
    return { type: "object", confidence: 1 };
  }

  // ── String inspection ────────────────────────────────────────────────────────
  if (typeof value === "string") {
    const s = value.trim();

    if (s === "") return { type: "string", confidence: 1 };

    // ISO date (high confidence)
    if (DATE_RE.test(s)) {
      return { type: "date", confidence: 0.95, normalised: s };
    }

    // Human date (medium confidence)
    if (HUMAN_DATE_RE.test(s)) {
      return { type: "date", confidence: 0.75, normalised: s };
    }

    // Email
    if (EMAIL_RE.test(s)) {
      return { type: "email", confidence: 0.9 };
    }

    // URL
    if (URL_RE.test(s)) {
      return { type: "url", confidence: 0.95 };
    }

    // Numeric string
    const asNum = Number(s);
    if (!isNaN(asNum) && s !== "") {
      return { type: "number", confidence: 0.8 };
    }

    // Phone (lowest priority — pattern is permissive)
    if (PHONE_RE.test(s) && s.replace(/\D/g, "").length >= 7) {
      return { type: "phone", confidence: 0.65 };
    }

    return { type: "string", confidence: 1 };
  }

  return { type: "string", confidence: 0.5 };
}

/**
 * Returns true if the value appears to be a date (ISO string, timestamp number,
 * or Date-like string) with at least the given confidence threshold.
 */
export function isDateLike(value: unknown, minConfidence = 0.7): boolean {
  if (typeof value === "number" && value > 0) return true; // treat as timestamp
  const result = detectType(value);
  return result.type === "date" && result.confidence >= minConfidence;
}

/**
 * Returns true if the value is a numeric value (number type or numeric string).
 */
export function isNumericLike(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return !isNaN(n) && value.trim() !== "";
  }
  return false;
}
