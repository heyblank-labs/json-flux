// =============================================================================
// security/hash.ts  (re-exported from mask.ts as internal)
// security/mask.ts
// Core masking engine — applies full, partial, hash, or custom masking.
//
// Design:
//   • Uses sync hash fallback so masking is always synchronous.
//   • Partial masking is type-aware: email, phone, generic strings.
//   • Full masking replaces entire value with maskChar repetition.
//   • Custom masking delegates to user-provided function.
//   • Never stores or returns original sensitive values in error paths.
// =============================================================================

import type {
  MaskMode,
  CustomMaskFn,
  FieldMaskConfig,
  MaskResult,
  AuditEntry,
} from "../types/security.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches } from "../filter/matcher.js";
import { joinPath } from "../utils/path.js";
import { hashValueSync } from "../utils/crypto.js";
import { detectPii } from "./detect.js";

// ---------------------------------------------------------------------------
// Value masking functions
// ---------------------------------------------------------------------------

/**
 * Applies a masking mode to a string value.
 */
export function applyMask(
  value: string,
  mode: MaskMode,
  maskChar: string,
  customFn?: CustomMaskFn,
  key = "",
  path = ""
): string {
  if (!value) return value;

  switch (mode) {
    case "full":
      return maskChar.repeat(Math.min(value.length, 8));

    case "partial":
      return applyPartialMask(value, maskChar);

    case "hash":
      return hashValueSync(value, 40);

    case "custom":
      if (typeof customFn === "function") {
        try {
          return customFn(value, key, path);
        } catch {
          return maskChar.repeat(8); // safe fallback
        }
      }
      return maskChar.repeat(8);
  }
}

/**
 * Partial masking — type-aware:
 *  • Email:  j***@example.com
 *  • Phone:  ***-***-1234 (show last 4)
 *  • Card:   ****-****-****-1234 (show last 4)
 *  • Generic: first char + *** + last char
 */
function applyPartialMask(value: string, maskChar: string): string {
  // Email: keep first char, domain
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    const [localPart, domain] = value.split("@");
    if (localPart && domain) {
      const first = localPart.charAt(0);
      return `${first}${maskChar.repeat(3)}@${domain}`;
    }
  }

  // Phone: keep last 4 digits
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 7) {
    const last4 = digits.slice(-4);
    return `${maskChar.repeat(3)}-${maskChar.repeat(3)}-${last4}`;
  }

  // Credit card: keep last 4 digits
  if (digits.length === 15 || digits.length === 16) {
    const last4 = digits.slice(-4);
    return `${maskChar.repeat(4)}-${maskChar.repeat(4)}-${maskChar.repeat(4)}-${last4}`;
  }

  // Generic: first + *** + last char (for short values just ***)
  if (value.length <= 2) return maskChar.repeat(4);
  const first = value.charAt(0);
  const last = value.charAt(value.length - 1);
  return `${first}${maskChar.repeat(Math.min(value.length - 2, 6))}${last}`;
}

// ---------------------------------------------------------------------------
// Public API: maskSensitive
// ---------------------------------------------------------------------------

/**
 * Masks sensitive fields in a JSON object.
 *
 * @param obj    - Source object.
 * @param config - Masking configuration.
 * @returns MaskResult with masked data and optional audit trail.
 *
 * @example
 * maskSensitive({
 *   user: { email: "alice@example.com", password: "secret123" }
 * }, {
 *   fields: ["user.email", "user.password"],
 *   mode: "partial",
 *   audit: true,
 * })
 * // → {
 * //   data: { user: { email: "a***@example.com", password: "s***3" } },
 * //   auditTrail: [{ path: "user.email", action: "masked", mode: "partial" }, ...],
 * //   maskedCount: 2,
 * // }
 *
 * @example
 * // Auto-detect all PII
 * maskSensitive(data, { autoDetect: true, mode: "full" })
 */
export function maskSensitive<T = unknown>(
  obj: T,
  config: FieldMaskConfig = {}
): MaskResult<T> {
  const {
    fields = [],
    mode = "full",
    customMask,
    autoDetect = false,
    autoDetectThreshold = 0.8,
    autoDetectCategories,
    audit = false,
    maxDepth = DEFAULT_MAX_DEPTH,
    maskChar = "*",
  } = config;

  const auditTrail: AuditEntry[] = [];
  let maskedCount = 0;
  const ctx = createTraversalContext();

  // Compile field matchers once
  const matchers = compileMatchers(fields);

  function shouldMaskByField(path: string, key: string): boolean {
    return fields.length > 0 && (
      anyMatcherMatches(matchers, path) ||
      anyMatcherMatches(matchers, key)
    );
  }

  function maskValue(value: JsonValue, key: string, path: string, category?: string): JsonValue {
    const strVal = typeof value === "string" ? value :
      value === null || value === undefined ? "" :
      String(value);

    const masked = applyMask(strVal, mode, maskChar, customMask, key, path);
    maskedCount++;

    if (audit) {
      auditTrail.push({
        path,
        key,
        action: "masked",
        mode,
        ...(category ? { category: category as import("../types/security.types.js").PiiCategory } : {}),
      });
    }

    return masked;
  }

  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return current;

    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;
        const childPath = joinPath(path, key);

        // Explicit field mask takes priority
        if (shouldMaskByField(childPath, key)) {
          result[key] = maskValue(value as JsonValue, key, childPath);
          continue;
        }

        // Auto-detection
        if (autoDetect && (value === null || typeof value !== "object" || Array.isArray(value))) {
          const detection = detectPii(key, value);
          if (
            detection.isSensitive &&
            detection.confidence >= autoDetectThreshold &&
            (!autoDetectCategories || (detection.category && autoDetectCategories.includes(detection.category)))
          ) {
            result[key] = maskValue(value as JsonValue, key, childPath, detection.category);
            continue;
          }
        }

        // Recurse
        result[key] = traverse(value, childPath, depth + 1);
      }

      ctx.unmarkSeen(current);
      return result;
    }

    if (Array.isArray(current)) {
      return current.map((item, i) => traverse(item, joinPath(path, i), depth + 1));
    }

    return current;
  }

  const data = traverse(obj, "", 0) as T;

  return Object.freeze<MaskResult<T>>({
    data,
    auditTrail: Object.freeze(auditTrail),
    maskedCount,
  });
}

/**
 * Convenience variant — returns masked data directly.
 */
export function maskSensitiveDirect<T = unknown>(obj: T, config: FieldMaskConfig = {}): T {
  return maskSensitive(obj, config).data;
}
