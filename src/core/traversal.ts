// =============================================================================
// core/traversal.ts
// Cycle-safe traversal context shared across all recursive functions.
//
// Design:
//  • Uses WeakSet for O(1) membership checks with no memory leaks.
//  • Each traversal creates its own isolated TraversalContext.
//  • Prototype-pollution keys are centralised here.
// =============================================================================

/** Keys that must never be set on any object — prototype pollution vectors. */
export const UNSAFE_KEYS = new Set<string>([
  "__proto__",
  "prototype",
  "constructor",
]);

/**
 * Returns true if the key is a known prototype-pollution vector.
 */
export function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

/**
 * Lightweight traversal context that tracks visited object references
 * to detect and break circular references.
 *
 * Create one instance per top-level traversal call.
 *
 * @example
 * const ctx = createTraversalContext();
 * function traverse(value: unknown): void {
 *   if (typeof value === 'object' && value !== null) {
 *     if (ctx.hasSeen(value)) return; // circular — skip
 *     ctx.markSeen(value);
 *     // ... recurse
 *   }
 * }
 */
export interface TraversalContext {
  /** Returns true if this object reference has been visited before. */
  hasSeen(obj: object): boolean;
  /** Marks an object reference as visited. */
  markSeen(obj: object): void;
  /** Removes an object from the seen set (for backtracking). */
  unmarkSeen(obj: object): void;
}

/**
 * Creates a new, isolated traversal context backed by a WeakSet.
 */
export function createTraversalContext(): TraversalContext {
  const seen = new WeakSet<object>();
  return {
    hasSeen: (obj) => seen.has(obj),
    markSeen: (obj) => seen.add(obj),
    unmarkSeen: (obj) => seen.delete(obj),
  };
}

/**
 * Returns true if the value is a plain object (not null, not array,
 * not a class instance, not a Date, etc.).
 *
 * Used as the universal plain-object type guard across all @heyblank-labs/json-flux functions.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Returns true if the value is a finite, safe number.
 */
export function isSafeNumber(value: unknown): value is number {
  return typeof value === "number" && isFinite(value);
}

/**
 * Clamps a number to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Default maximum recursion depth across all @heyblank-labs/json-flux functions. */
export const DEFAULT_MAX_DEPTH = 20;

/** Default key delimiter for dot-notation paths. */
export const DEFAULT_DELIMITER = ".";
