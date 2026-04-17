// =============================================================================
// security/detect.ts
// Auto-detects PII / sensitive data in JSON key names and values.
//
// Resolution order (highest confidence first):
//   1. Key name hints (exact category match, confidence 0.95)
//   2. Value pattern matching (regex, confidence 0.7–0.9)
//   3. Combined key+value (boosts confidence to 0.99)
// =============================================================================

import type { PiiDetectionResult, PiiCategory } from "../types/security.types.js";
import {
  EMAIL_RE, PHONE_RE, CREDIT_CARD_RE, SSN_RE, IPV4_RE, UUID_RE, JWT_RE, TOKEN_RE,
  EMAIL_KEY_HINTS, PHONE_KEY_HINTS, PASSWORD_KEY_HINTS, TOKEN_KEY_HINTS,
  SSN_KEY_HINTS, CREDIT_CARD_KEY_HINTS, IP_KEY_HINTS,
  normaliseKeyForHint,
} from "../utils/regex.js";

// ---------------------------------------------------------------------------
// Key-name detection
// ---------------------------------------------------------------------------

function detectByKey(normKey: string): { category: PiiCategory; confidence: number } | null {
  if (EMAIL_KEY_HINTS.has(normKey))       return { category: "email",      confidence: 0.95 };
  if (PHONE_KEY_HINTS.has(normKey))       return { category: "phone",      confidence: 0.95 };
  if (PASSWORD_KEY_HINTS.has(normKey))    return { category: "password",   confidence: 0.97 };
  if (TOKEN_KEY_HINTS.has(normKey))       return { category: "token",      confidence: 0.95 };
  if (SSN_KEY_HINTS.has(normKey))         return { category: "ssn",        confidence: 0.95 };
  if (CREDIT_CARD_KEY_HINTS.has(normKey)) return { category: "creditCard", confidence: 0.95 };
  if (IP_KEY_HINTS.has(normKey))          return { category: "ipAddress",  confidence: 0.90 };

  // Partial key-name heuristics
  if (normKey.includes("email"))    return { category: "email",    confidence: 0.80 };
  if (normKey.includes("phone") || normKey.includes("mobile")) return { category: "phone", confidence: 0.80 };
  if (normKey.includes("password") || normKey.includes("secret")) return { category: "password", confidence: 0.85 };
  if (normKey.includes("token") || normKey.includes("apikey"))    return { category: "token", confidence: 0.85 };

  return null;
}

// ---------------------------------------------------------------------------
// Value-based detection
// ---------------------------------------------------------------------------

function detectByValue(value: string): { category: PiiCategory; confidence: number } | null {
  if (EMAIL_RE.test(value))       return { category: "email",      confidence: 0.90 };
  if (UUID_RE.test(value))        return { category: "uuid",       confidence: 0.88 };
  if (JWT_RE.test(value) && value.length > 40) return { category: "token", confidence: 0.85 };
  if (TOKEN_RE.test(value) && value.length >= 24) return { category: "token", confidence: 0.75 };
  if (SSN_RE.test(value))         return { category: "ssn",        confidence: 0.90 };
  if (CREDIT_CARD_RE.test(value)) return { category: "creditCard", confidence: 0.90 };
  if (IPV4_RE.test(value))        return { category: "ipAddress",  confidence: 0.88 };
  if (PHONE_RE.test(value) && value.replace(/\D/g, "").length >= 7)
    return { category: "phone", confidence: 0.70 };

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects whether a field contains sensitive / PII data.
 *
 * @param key   - The raw key name.
 * @param value - The field value.
 * @returns A PiiDetectionResult with sensitivity flag, category, and confidence.
 *
 * @example
 * detectPii("email", "alice@example.com")
 * // → { isSensitive: true, category: "email", confidence: 0.99, detectedByKey: true, detectedByValue: true }
 *
 * @example
 * detectPii("data", "alice@example.com")
 * // → { isSensitive: true, category: "email", confidence: 0.90, detectedByKey: false, detectedByValue: true }
 *
 * @example
 * detectPii("name", "Alice Smith")
 * // → { isSensitive: false, confidence: 0, detectedByKey: false, detectedByValue: false }
 */
export function detectPii(key: string, value: unknown): PiiDetectionResult {
  const normKey = normaliseKeyForHint(key);
  const keyResult = detectByKey(normKey);

  let valueResult: { category: PiiCategory; confidence: number } | null = null;
  if (typeof value === "string" && value.length > 0) {
    valueResult = detectByValue(value);
  }

  if (!keyResult && !valueResult) {
    return { isSensitive: false, confidence: 0, detectedByKey: false, detectedByValue: false };
  }

  // Combine — use highest confidence, boost when both agree
  let category: PiiCategory;
  let confidence: number;

  if (keyResult && valueResult) {
    category = keyResult.category;
    confidence = Math.min(0.99, Math.max(keyResult.confidence, valueResult.confidence) + 0.05);
  } else if (keyResult) {
    category = keyResult.category;
    confidence = keyResult.confidence;
  } else {
    category = valueResult!.category;
    confidence = valueResult!.confidence;
  }

  return {
    isSensitive: true,
    category,
    confidence,
    detectedByKey: keyResult !== null,
    detectedByValue: valueResult !== null,
  };
}

/**
 * Returns true if the given key name matches any known PII key hint.
 * Fast O(1) lookup — useful as a pre-filter before full detection.
 */
export function isSensitiveKey(key: string): boolean {
  const norm = normaliseKeyForHint(key);
  return (
    EMAIL_KEY_HINTS.has(norm) ||
    PHONE_KEY_HINTS.has(norm) ||
    PASSWORD_KEY_HINTS.has(norm) ||
    TOKEN_KEY_HINTS.has(norm) ||
    SSN_KEY_HINTS.has(norm) ||
    CREDIT_CARD_KEY_HINTS.has(norm) ||
    IP_KEY_HINTS.has(norm)
  );
}
