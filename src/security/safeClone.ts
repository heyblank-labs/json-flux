// =============================================================================
// security/safeClone.ts
// Creates a masked-safe deep clone — useful for logging, serialization,
// and passing data to untrusted consumers without leaking sensitive values.
// =============================================================================

import type { SafeCloneOptions, MaskResult } from "../types/security.types.js";
import { maskSensitive } from "./mask.js";
import { redactKeys } from "./redact.js";

/**
 * Creates a safe deep clone of an object with masking and/or redaction applied.
 * Combines the mask + redact layers in a single pass for efficiency.
 *
 * @param obj     - The source object.
 * @param options - Safe clone configuration.
 * @returns A MaskResult containing the safe clone and audit metadata.
 *
 * @example
 * safeClone(
 *   { user: { name: "Alice", password: "secret", email: "alice@example.com" } },
 *   {
 *     maskFields:   ["user.email"],
 *     redactFields: ["user.password"],
 *     mode: "partial",
 *   }
 * ).data
 * // → { user: { name: "Alice", email: "a***@example.com" } }
 * //   (password removed entirely)
 *
 * @example
 * // Auto-detect and mask all PII
 * safeClone(data, { autoDetect: true, mode: "full" }).data
 */
export function safeClone<T = unknown>(
  obj: T,
  options: SafeCloneOptions = {}
): MaskResult<T> {
  const {
    maskFields = [],
    redactFields = [],
    mode = "full",
    autoDetect = false,
    maxDepth = 20,
  } = options;

  // Step 1: Redact (remove) first so they don't appear in the mask pass
  let workingData: unknown = obj;
  let combinedAudit: readonly import("../types/security.types.js").AuditEntry[] = [];
  let totalMasked = 0;

  if (redactFields.length > 0 || autoDetect) {
    const redactResult = redactKeys(workingData, redactFields, {
      autoDetect,
      audit: true,
      maxDepth,
    });
    workingData = redactResult.data;
    combinedAudit = [...combinedAudit, ...redactResult.auditTrail];
    totalMasked += redactResult.maskedCount;
  }

  // Step 2: Mask remaining fields
  if (maskFields.length > 0 || autoDetect) {
    const maskResult = maskSensitive(workingData, {
      fields: maskFields,
      mode,
      autoDetect,
      audit: true,
      maxDepth,
    });
    workingData = maskResult.data;
    combinedAudit = [...combinedAudit, ...maskResult.auditTrail];
    totalMasked += maskResult.maskedCount;
  }

  return Object.freeze<MaskResult<T>>({
    data: workingData as T,
    auditTrail: Object.freeze(combinedAudit),
    maskedCount: totalMasked,
  });
}

/**
 * Convenience variant — returns the safe clone directly.
 */
export function safeCloneDirect<T = unknown>(obj: T, options: SafeCloneOptions = {}): T {
  return safeClone(obj, options).data;
}
