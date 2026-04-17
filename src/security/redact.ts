// =============================================================================
// security/redact.ts
// Completely removes sensitive keys from a JSON object.
// Lighter-weight than masking when fields must not appear at all.
//
// Delegates to the v0.3.0 excludeKeys engine for consistency.
// Adds audit trail and auto-detection on top.
// =============================================================================

import type { AuditEntry, MaskResult, PiiCategory } from "../types/security.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches } from "../filter/matcher.js";
import { joinPath } from "../utils/path.js";
import { detectPii } from "./detect.js";

export interface RedactOptions {
  /**
   * When true, auto-detect PII keys and redact them.
   * @default false
   */
  autoDetect?: boolean;

  /** Minimum confidence for auto-detection. @default 0.8 */
  autoDetectThreshold?: number;

  /** PII categories to auto-detect. Undefined = all. */
  autoDetectCategories?: readonly PiiCategory[];

  /** Record operations in audit trail. @default false */
  audit?: boolean;

  /** Maximum recursion depth. @default 20 */
  maxDepth?: number;
}

/**
 * Completely removes specified keys from a JSON object.
 *
 * @param obj   - Source object.
 * @param keys  - Array of paths/keys/patterns to remove.
 * @param options - Redact options.
 *
 * @example
 * redactKeys(
 *   { user: { name: "Alice", password: "secret", token: "abc123" } },
 *   ["user.password", "user.token"]
 * ).data
 * // → { user: { name: "Alice" } }
 *
 * @example
 * // Auto-detect and redact all PII
 * redactKeys(data, [], { autoDetect: true }).data
 */
export function redactKeys<T = unknown>(
  obj: T,
  keys: readonly string[] = [],
  options: RedactOptions = {}
): MaskResult<T> {
  const {
    autoDetect = false,
    autoDetectThreshold = 0.8,
    autoDetectCategories,
    audit = false,
    maxDepth = DEFAULT_MAX_DEPTH,
  } = options;

  const auditTrail: AuditEntry[] = [];
  let maskedCount = 0;
  const ctx = createTraversalContext();
  const matchers = compileMatchers(keys as string[]);

  function shouldRedactByField(path: string, key: string): boolean {
    return keys.length > 0 && (
      anyMatcherMatches(matchers, path) ||
      anyMatcherMatches(matchers, key)
    );
  }

  function doRedact(key: string, path: string, category?: PiiCategory): void {
    maskedCount++;
    if (audit) {
      auditTrail.push({
        path, key,
        action: "redacted",
        ...(category ? { category } : {}),
      });
    }
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

        if (shouldRedactByField(childPath, key)) {
          doRedact(key, childPath);
          continue; // omit entirely
        }

        if (autoDetect) {
          const detection = detectPii(key, value as JsonValue);
          if (
            detection.isSensitive &&
            detection.confidence >= autoDetectThreshold &&
            (!autoDetectCategories || (detection.category && autoDetectCategories.includes(detection.category)))
          ) {
            doRedact(key, childPath, detection.category);
            continue;
          }
        }

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
 * Convenience variant — returns redacted data directly.
 */
export function redactKeysDirect<T = unknown>(
  obj: T,
  keys: readonly string[] = [],
  options: RedactOptions = {}
): T {
  return redactKeys(obj, keys, options).data;
}
