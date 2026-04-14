// =============================================================================
// tests/helpers.test.ts
// Coverage for utils/helpers.ts and core/traversal.ts
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  deepClone,
  deepMerge,
  deepEqual,
  toSafeString,
  omitKeys,
  pickKeys,
} from "../src/utils/helpers.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  isSafeNumber,
  clamp,
  UNSAFE_KEYS,
} from "../src/core/traversal.js";

// ── deepClone ─────────────────────────────────────────────────────────────────

describe("deepClone", () => {
  it("clones a plain object deeply", () => {
    const original = { a: 1, b: { c: [1, 2, 3] } };
    const clone = deepClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
  });

  it("clones arrays", () => {
    const arr = [1, [2, 3], { x: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
  });

  it("clones primitives", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(true)).toBe(true);
    expect(deepClone(null)).toBeNull();
  });

  it("does not share references for nested objects", () => {
    const original = { nested: { value: 1 } };
    const clone = deepClone(original);
    clone.nested.value = 99;
    expect(original.nested.value).toBe(1);
  });
});

// ── deepMerge ─────────────────────────────────────────────────────────────────

describe("deepMerge", () => {
  it("merges two flat objects", () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("deep-merges nested objects", () => {
    const result = deepMerge({ user: { name: "Alice", role: "user" } }, { user: { role: "admin" } });
    expect(result).toEqual({ user: { name: "Alice", role: "admin" } });
  });

  it("later sources win on scalar conflicts", () => {
    const result = deepMerge({ a: 1 }, { a: 2 });
    expect(result["a"]).toBe(2);
  });

  it("handles three sources", () => {
    const result = deepMerge({ a: 1 }, { b: 2 }, { c: 3 });
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("does not mutate any source", () => {
    const src1 = { a: 1 };
    const src2 = { b: 2 };
    deepMerge(src1, src2);
    expect(src1).toEqual({ a: 1 });
    expect(src2).toEqual({ b: 2 });
  });

  it("handles empty source", () => {
    const result = deepMerge({ a: 1 }, {});
    expect(result).toEqual({ a: 1 });
  });

  it("handles non-object overwrites object", () => {
    const result = deepMerge({ a: { x: 1 } }, { a: 42 as unknown as Record<string, unknown> });
    expect(result["a"]).toBe(42);
  });
});

// ── deepEqual ─────────────────────────────────────────────────────────────────

describe("deepEqual", () => {
  it("returns true for identical primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
  });

  it("returns true for deeply equal objects", () => {
    expect(deepEqual({ a: { b: [1, 2, 3] } }, { a: { b: [1, 2, 3] } })).toBe(true);
  });

  it("returns false for objects with different keys", () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("returns false for objects with different values", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("returns true for equal arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("returns false for arrays of different length", () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("returns false when one is null", () => {
    expect(deepEqual(null, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, null)).toBe(false);
  });

  it("returns true for null === null", () => {
    expect(deepEqual(null, null)).toBe(true);
  });

  it("returns false for different types", () => {
    expect(deepEqual(1, "1")).toBe(false);
  });
});

// ── toSafeString ──────────────────────────────────────────────────────────────

describe("toSafeString", () => {
  it("converts null to empty string", () => expect(toSafeString(null)).toBe(""));
  it("converts undefined to empty string", () => expect(toSafeString(undefined)).toBe(""));
  it("returns string as-is", () => expect(toSafeString("hello")).toBe("hello"));
  it("converts number to string", () => expect(toSafeString(42)).toBe("42"));
  it("converts boolean to string", () => expect(toSafeString(true)).toBe("true"));
  it("serializes object to JSON", () => expect(toSafeString({ id: 1 })).toBe('{"id":1}'));
  it("serializes array to JSON", () => expect(toSafeString([1, 2])).toBe("[1,2]"));
});

// ── omitKeys ──────────────────────────────────────────────────────────────────

describe("omitKeys", () => {
  it("omits specified keys", () => {
    const result = omitKeys({ a: 1, b: 2, c: 3 }, ["b", "c"]);
    expect(result).toEqual({ a: 1 });
  });

  it("returns shallow copy with all keys when none omitted", () => {
    const result = omitKeys({ a: 1, b: 2 }, []);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("handles omitting non-existent keys gracefully", () => {
    const result = omitKeys({ a: 1 }, ["z"]);
    expect(result).toEqual({ a: 1 });
  });

  it("does not mutate original", () => {
    const original = { a: 1, b: 2 };
    omitKeys(original, ["a"]);
    expect(original).toEqual({ a: 1, b: 2 });
  });
});

// ── pickKeys ──────────────────────────────────────────────────────────────────

describe("pickKeys", () => {
  it("picks only specified keys", () => {
    const result = pickKeys({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("returns empty object when picking non-existent keys", () => {
    const result = pickKeys({ a: 1 }, ["z"]);
    expect(result).toEqual({});
  });

  it("returns empty object when picking nothing", () => {
    const result = pickKeys({ a: 1, b: 2 }, []);
    expect(result).toEqual({});
  });

  it("does not mutate original", () => {
    const original = { a: 1, b: 2 };
    pickKeys(original, ["a"]);
    expect(original).toEqual({ a: 1, b: 2 });
  });
});

// ── TraversalContext ──────────────────────────────────────────────────────────

describe("createTraversalContext", () => {
  it("tracks seen objects", () => {
    const ctx = createTraversalContext();
    const obj = { a: 1 };
    expect(ctx.hasSeen(obj)).toBe(false);
    ctx.markSeen(obj);
    expect(ctx.hasSeen(obj)).toBe(true);
  });

  it("unmarks seen objects", () => {
    const ctx = createTraversalContext();
    const obj = { a: 1 };
    ctx.markSeen(obj);
    ctx.unmarkSeen(obj);
    expect(ctx.hasSeen(obj)).toBe(false);
  });

  it("each context is isolated", () => {
    const ctx1 = createTraversalContext();
    const ctx2 = createTraversalContext();
    const obj = { a: 1 };
    ctx1.markSeen(obj);
    expect(ctx2.hasSeen(obj)).toBe(false);
  });
});

// ── isPlainObject ─────────────────────────────────────────────────────────────

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("returns true for null-prototype objects", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("returns false for arrays", () => expect(isPlainObject([])).toBe(false));
  it("returns false for null", () => expect(isPlainObject(null)).toBe(false));
  it("returns false for primitives", () => {
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject("str")).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });
  it("returns false for class instances", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});

// ── isUnsafeKey ───────────────────────────────────────────────────────────────

describe("isUnsafeKey", () => {
  it("flags __proto__", () => expect(isUnsafeKey("__proto__")).toBe(true));
  it("flags prototype", () => expect(isUnsafeKey("prototype")).toBe(true));
  it("flags constructor", () => expect(isUnsafeKey("constructor")).toBe(true));
  it("allows safe keys", () => {
    expect(isUnsafeKey("name")).toBe(false);
    expect(isUnsafeKey("id")).toBe(false);
    expect(isUnsafeKey("data")).toBe(false);
  });
  it("UNSAFE_KEYS set contains all three vectors", () => {
    expect(UNSAFE_KEYS.has("__proto__")).toBe(true);
    expect(UNSAFE_KEYS.has("prototype")).toBe(true);
    expect(UNSAFE_KEYS.has("constructor")).toBe(true);
  });
});

// ── isSafeNumber / clamp ──────────────────────────────────────────────────────

describe("isSafeNumber", () => {
  it("returns true for finite numbers", () => {
    expect(isSafeNumber(0)).toBe(true);
    expect(isSafeNumber(42)).toBe(true);
    expect(isSafeNumber(-1.5)).toBe(true);
  });
  it("returns false for Infinity", () => expect(isSafeNumber(Infinity)).toBe(false));
  it("returns false for NaN", () => expect(isSafeNumber(NaN)).toBe(false));
  it("returns false for non-numbers", () => {
    expect(isSafeNumber("42")).toBe(false);
    expect(isSafeNumber(null)).toBe(false);
  });
});

describe("clamp", () => {
  it("clamps below min", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("clamps above max", () => expect(clamp(15, 0, 10)).toBe(10));
  it("passes through value in range", () => expect(clamp(5, 0, 10)).toBe(5));
  it("handles boundary values", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
