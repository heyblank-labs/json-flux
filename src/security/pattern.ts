// =============================================================================
// security/pattern.ts
// Masks values matching user-supplied regex patterns.
//
// Two modes:
//   maskMatchOnly: false (default) — mask entire field value when pattern matches
//   maskMatchOnly: true            — replace only the matched portion
// =============================================================================

import type { PatternMaskConfig, MaskResult, AuditEntry } from "../types/security.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { joinPath } from "../utils/path.js";
import { applyMask } from "./mask.js";

/**
 * Masks values in a JSON object that match any of the provided regex patterns.
 *
 * @param obj    - Source object.
 * @param config - Pattern mask configuration.
 *
 * @example
 * maskByPattern(data, {
 *   patterns: {
 *     email:  /[^\s@]+@[^\s@]+\.[^\s@]+/gi,
 *     phone:  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
 *   },
 *   mode: "partial",
 * })
 *
 * @example
 * // Replace only the matched portion inside a string
 * maskByPattern(
 *   { notes: "Call me at 9876543210 or email me at alice@example.com" },
 *   {
 *     patterns: { contact: /\S+@\S+|\d{10}/g },
 *     mode: "full",
 *     maskMatchOnly: true,
 *   }
 * )
 * // → { notes: "Call me at ******** or email me at ********" }
 */
export function maskByPattern<T = unknown>(
  obj: T,
  config: PatternMaskConfig
): MaskResult<T> {
  const {
    patterns,
    mode = "full",
    customMask,
    maskMatchOnly = false,
    audit = false,
    maxDepth = DEFAULT_MAX_DEPTH,
    maskChar = "*",
  } = config;

  const auditTrail: AuditEntry[] = [];
  let maskedCount = 0;
  const ctx = createTraversalContext();

  // Pre-validate: clone patterns to avoid side effects on stateful regex
  const patternEntries = Object.entries(patterns).filter(
    ([, re]) => re instanceof RegExp
  );

  function matchesAnyPattern(value: string): string | null {
    for (const [, re] of patternEntries) {
      // Reset lastIndex for global regexes
      re.lastIndex = 0;
      if (re.test(value)) {
        re.lastIndex = 0;
        return value;
      }
    }
    return null;
  }

  function replaceMatches(value: string): string {
    let result = value;
    for (const [, re] of patternEntries) {
      re.lastIndex = 0;
      result = result.replace(re, (match) =>
        applyMask(match, mode, maskChar, customMask)
      );
    }
    return result;
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

        if (typeof value === "string" && value.length > 0) {
          if (maskMatchOnly) {
            // Replace only matched portions
            const masked = replaceMatches(value);
            if (masked !== value) {
              result[key] = masked;
              maskedCount++;
              if (audit) auditTrail.push({ path: childPath, key, action: "masked", mode });
              continue;
            }
          } else {
            // Mask entire value if any pattern matches
            if (matchesAnyPattern(value)) {
              result[key] = applyMask(value, mode, maskChar, customMask, key, childPath);
              maskedCount++;
              if (audit) auditTrail.push({ path: childPath, key, action: "masked", mode });
              continue;
            }
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
 * Convenience variant — returns masked data directly.
 */
export function maskByPatternDirect<T = unknown>(obj: T, config: PatternMaskConfig): T {
  return maskByPattern(obj, config).data;
}
