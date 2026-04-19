// =============================================================================
// query/where.ts
// Compiles where() clauses — either raw predicate functions or
// path-operator-value triples — into a single boolean test function.
//
// Design:
//   • Path-based: uses extractField (v0.1) for safe value extraction.
//   • Operator aliases normalised at compile time (no repeated string checks).
//   • Prototype pollution safe — all paths go through extractField.
//   • No eval, no dynamic code.
// =============================================================================

import type { WhereOperator, WherePredicate } from "../types/query.types.js";
import { extractField } from "../core/extract.js";
import { isUnsafeKey } from "../core/traversal.js";

// ---------------------------------------------------------------------------
// Operator normalisation
// ---------------------------------------------------------------------------

type NormalisedOp =
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";

function normaliseOperator(op: WhereOperator): NormalisedOp {
  switch (op) {
    case "=" : case "==": case "eq":  return "eq";
    case "!=":            case "ne":  return "ne";
    case ">" :            case "gt":  return "gt";
    case ">=":            case "gte": return "gte";
    case "<" :            case "lt":  return "lt";
    case "<=":            case "lte": return "lte";
    case "in":                        return "in";
    case "contains":                  return "contains";
    default:                          return "eq";
  }
}

// ---------------------------------------------------------------------------
// Operator evaluation
// ---------------------------------------------------------------------------

function evaluate(left: unknown, op: NormalisedOp, right: unknown): boolean {
  switch (op) {
    case "eq":  return left === right;
    case "ne":  return left !== right;
    case "gt":  return typeof left === "number" && typeof right === "number" && left > right;
    case "gte": return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt":  return typeof left === "number" && typeof right === "number" && left < right;
    case "lte": return typeof left === "number" && typeof right === "number" && left <= right;
    case "in":
      return Array.isArray(right) && right.includes(left);
    case "contains":
      if (typeof left === "string" && typeof right === "string") {
        return left.toLowerCase().includes(right.toLowerCase());
      }
      if (Array.isArray(left)) return left.includes(right);
      return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compiles a path-operator-value triple into a predicate function.
 */
export function compilePathPredicate<T>(
  path: string,
  op: WhereOperator,
  value: unknown
): WherePredicate<T> {
  // Security: validate path segments
  const segments = path.split(".");
  if (segments.some((s) => isUnsafeKey(s))) {
    // Unsafe path — always return false
    return () => false;
  }

  const normOp = normaliseOperator(op);

  return (item: T) => {
    const extracted = extractField(item as Record<string, unknown>, path);
    return evaluate(extracted, normOp, value);
  };
}

/**
 * Composes multiple predicates with AND logic.
 */
export function andPredicates<T>(
  predicates: Array<WherePredicate<T>>
): WherePredicate<T> {
  if (predicates.length === 1) return predicates[0]!;
  return (item: T, index: number) =>
    predicates.every((pred) => pred(item, index));
}
