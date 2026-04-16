// =============================================================================
// value/transform.ts
// Core value transformation engine for v0.4.0.
//
// Pipeline (single traversal):
//   1. Apply defaults to null/missing fields
//   2. Walk the tree: apply path-matched transformers to each value
//   3. Apply auto-formatting if enabled
//   4. Inject computed/virtual fields
//
// Design:
//   • Transformers compiled to a fast lookup map before traversal.
//   • Single O(n) pass — no repeated tree scans.
//   • Cycle-safe via WeakSet.
//   • Pure — never mutates input.
//   • All results are frozen.
// =============================================================================

import type {
  TransformValuesConfig,
  TransformResult,
  TransformConfig,
  ValueTransformer,
} from "../types/value.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { compileMatchers, anyMatcherMatches } from "../filter/matcher.js";
import { joinPath } from "../utils/path.js";
import { applyDefaults } from "./defaults.js";
import { injectComputedFields } from "./computed.js";
import { detectType } from "./detect.js";
import { createDateFormatter } from "./formatters/date.js";
import { createCurrencyFormatter } from "./formatters/currency.js";
import { createBooleanFormatter } from "./formatters/boolean.js";
import { createEnumFormatter } from "./formatters/enum.js";

// ---------------------------------------------------------------------------
// Transformer resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a TransformConfig entry to a raw ValueTransformer function.
 * Pre-compiles formatter instances to avoid per-call construction.
 */
function resolveTransformer(config: TransformConfig): ValueTransformer {
  if (typeof config === "function") return config;

  switch (config.type) {
    case "date": {
      const fmt = createDateFormatter(config.options ?? {});
      return (value) => fmt(value) as JsonValue;
    }
    case "currency": {
      const fmt = createCurrencyFormatter(config.options ?? {});
      return (value) => fmt(value) as JsonValue;
    }
    case "boolean": {
      const fmt = createBooleanFormatter(config.options ?? {});
      return (value) => fmt(value) as JsonValue;
    }
    case "number": {
      // Inline to avoid circular import with boolean.ts
      return (value) => {
        if (value === null || value === undefined) return "—";
        const n =
          typeof value === "number"
            ? value
            : typeof value === "string"
            ? Number(value.trim())
            : NaN;
        if (isNaN(n) || !isFinite(n)) return "—";
        try {
          return new Intl.NumberFormat(
            config.options?.locale ?? "en-US",
            {
              minimumFractionDigits: config.options?.minimumFractionDigits ?? 0,
              maximumFractionDigits: config.options?.maximumFractionDigits ?? 2,
            }
          ).format(n);
        } catch {
          return "—";
        }
      };
    }
    case "enum": {
      const fmt = createEnumFormatter(config.options);
      return (value) => fmt(value) as JsonValue;
    }
    case "default": {
      const defaultVal = config.value;
      return (value) => (value === null || value === undefined ? defaultVal : value);
    }
    case "auto": {
      return (value) => autoFormat(value);
    }
  }
}

/**
 * Auto-formats a value based on its detected type.
 * Used when autoFormat: true or transform config is { type: "auto" }.
 */
function autoFormat(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  const { type } = detectType(value);
  switch (type) {
    case "date":
      return createDateFormatter()(value) as JsonValue;
    case "boolean":
      return createBooleanFormatter()(value) as JsonValue;
    default:
      return value as JsonValue;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transforms values in a JSON object according to the provided configuration.
 *
 * Transformations are applied in this order:
 *   1. `defaults` — fill null/undefined fields
 *   2. `transforms` — apply per-path transformers (date, currency, enum, custom…)
 *   3. `autoFormat` — auto-detect and format remaining fields (optional)
 *   4. `computed` — inject virtual fields derived from the full object
 *
 * @param obj    - The source object to transform.
 * @param config - Transformation configuration.
 * @returns A `TransformResult` with the transformed data and audit metadata.
 *
 * @example
 * transformValues({
 *   user: { dob: "1990-01-15", salary: 75000, active: true, status: "APPROVED" }
 * }, {
 *   transforms: {
 *     "user.dob":    { type: "date", options: { format: "DD MMM YYYY" } },
 *     "user.salary": { type: "currency", options: { currency: "INR", locale: "en-IN" } },
 *     "user.active": { type: "boolean", options: { trueLabel: "Active" } },
 *     "user.status": { type: "enum", options: {
 *       map: { APPROVED: "Approved", PENDING: "Pending" }
 *     }},
 *   },
 *   computed: {
 *     "user.displaySalary": (root) => `Salary: ${(root as any).user.salary}`,
 *   },
 *   defaults: { "user.middleName": "N/A" },
 * })
 */
export function transformValues<T = unknown>(
  obj: T,
  config: TransformValuesConfig = {}
): TransformResult<T> {
  const {
    transforms = {},
    computed = {},
    defaults = {},
    maxDepth = DEFAULT_MAX_DEPTH,
    autoFormat: shouldAutoFormat = false,
  } = config;

  const transformedPaths: string[] = [];
  const ctx = createTraversalContext();

  // ── Step 1: Apply defaults ────────────────────────────────────────────────
  let working: unknown = obj;
  let defaultedPaths: string[] = [];

  if (Object.keys(defaults).length > 0) {
    const result = applyDefaults(working, defaults, { maxDepth });
    working = result.data;
    defaultedPaths = result.defaultedPaths;
  }

  // ── Step 2: Compile transformers ─────────────────────────────────────────
  const transformEntries = Object.entries(transforms);

  // Separate bare keys vs path patterns for fast lookup
  const bareKeyTransformers = new Map<string, ValueTransformer>();
  const pathTransformerPatterns: Array<{ matcher: ReturnType<typeof compileMatchers>[number]; fn: ValueTransformer }> = [];

  for (const [pattern, cfg] of transformEntries) {
    const fn = resolveTransformer(cfg);
    const isBare = !pattern.includes(".") && !pattern.includes("[") && !pattern.includes("*");
    if (isBare) {
      bareKeyTransformers.set(pattern, fn);
    } else {
      const matchers = compileMatchers([pattern]);
      if (matchers[0]) {
        pathTransformerPatterns.push({ matcher: matchers[0], fn });
      }
    }
  }

  function findTransformer(path: string, key: string): ValueTransformer | undefined {
    // Exact path match in bare keys
    const bareMatch = bareKeyTransformers.get(key);
    if (bareMatch) return bareMatch;
    // Exact path match
    if (transforms[path]) {
      return resolveTransformer(transforms[path] as TransformConfig);
    }
    // Pattern match
    for (const { matcher, fn } of pathTransformerPatterns) {
      if (matcher.matches(path)) return fn;
    }
    return undefined;
  }

  // ── Step 3: Traverse and transform ───────────────────────────────────────
  function traverse(current: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return current;

    if (isPlainObject(current)) {
      if (ctx.hasSeen(current)) return current;
      ctx.markSeen(current);

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(current)) {
        if (isUnsafeKey(key)) continue;

        const childPath = joinPath(path, key);
        const transformer = findTransformer(childPath, key);

        if (transformer) {
          // Apply transformer to this value (don't recurse into transformed values)
          const parent = current as Readonly<Record<string, JsonValue>>;
          try {
            result[key] = transformer(value as JsonValue, key, childPath, parent);
          } catch {
            result[key] = value; // transformer threw — keep original
          }
          transformedPaths.push(childPath);
        } else if (shouldAutoFormat && !isPlainObject(value) && !Array.isArray(value)) {
          result[key] = autoFormat(value);
        } else {
          result[key] = traverse(value, childPath, depth + 1);
        }
      }

      ctx.unmarkSeen(current);
      return result;
    }

    if (Array.isArray(current)) {
      return current.map((item, i) => traverse(item, joinPath(path, i), depth + 1));
    }

    // Top-level primitive
    if (path === "") {
      const transformer = findTransformer("", "");
      if (transformer && shouldAutoFormat) {
        return autoFormat(current);
      }
    }

    return current;
  }

  working = traverse(working, "", 0);

  // ── Step 4: Inject computed fields ───────────────────────────────────────
  let computedPaths: string[] = [];

  if (Object.keys(computed).length > 0 && isPlainObject(working)) {
    const result = injectComputedFields(working, computed);
    working = result.data;
    computedPaths = result.computedPaths;
  }

  return Object.freeze<TransformResult<T>>({
    data: working as T,
    transformedPaths: Object.freeze(transformedPaths),
    defaultedPaths: Object.freeze(defaultedPaths),
    computedPaths: Object.freeze(computedPaths),
  });
}

/**
 * Convenience variant that returns the transformed value directly.
 *
 * @example
 * transformValuesDirect(data, {
 *   transforms: { "user.dob": { type: "date" } }
 * })
 */
export function transformValuesDirect<T = unknown>(
  obj: T,
  config: TransformValuesConfig = {}
): T {
  return transformValues(obj, config).data;
}
