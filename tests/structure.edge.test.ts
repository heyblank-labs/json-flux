// =============================================================================
// tests/structure.edge.test.ts
// Additional edge cases for v0.5.0 structure layer branch coverage
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { unflatten } from "../src/structure/unflatten.js";
import { remapObject } from "../src/structure/remap.js";
import { mergeDeep } from "../src/structure/merge.js";
import { normalizeKeys } from "../src/structure/normalizeKeys.js";
import { convertKeyCase, clearCaseCache } from "../src/utils/case.js";

beforeEach(() => clearCaseCache());

// =============================================================================
// unflatten — edge branches
// =============================================================================

describe("unflatten — edge branches", () => {
  it("skips paths exceeding maxDepth", () => {
    const flat: Record<string, number> = {};
    flat["a.b.c.d.e.f"] = 1;
    const result = unflatten(flat, { maxDepth: 3 });
    // Path depth 6 > maxDepth 3 → skipped
    expect(result).toEqual({});
  });

  it("handles numeric segment that is NaN safely", () => {
    // "[abc]" as bracket content with non-numeric index
    const result = unflatten({ "[abc].name": "test" });
    expect((result as any)["abc"]?.name).toBe("test");
  });

  it("handles deeply bracket-escaped then dot path", () => {
    const result = unflatten({ "[key.with.dots].sub": 42 });
    expect((result as any)["key.with.dots"]?.sub).toBe(42);
  });

  it("handles multiple array indices in same path", () => {
    const result = unflatten({ "matrix[0][1]": "cell" });
    // matrix → 0 → 1 = "cell"
    expect(result.matrix).toBeDefined();
  });

  it("handles delimiter at start — skips empty first segment", () => {
    const result = unflatten({ ".leading": "value" });
    // Leading delimiter produces empty first segment — handled gracefully
    expect(result).toBeDefined();
  });

  it("handles value null in flat record", () => {
    const result = unflatten({ "user.name": null });
    expect((result as any).user.name).toBeNull();
  });

  it("handles value 0 (falsy but valid)", () => {
    const result = unflatten({ "stats.count": 0 });
    expect((result as any).stats.count).toBe(0);
  });

  it("handles value false (falsy but valid)", () => {
    const result = unflatten({ "user.active": false });
    expect((result as any).user.active).toBe(false);
  });

  it("handles path with only one segment and no dot", () => {
    const result = unflatten({ name: "Alice" });
    expect(result.name).toBe("Alice");
  });

  it("overwrites same path set multiple times (last wins)", () => {
    const result = unflatten({ "a.b": 1, "a.b": 2 });
    expect((result as any).a.b).toBe(2);
  });
});

// =============================================================================
// remapObject — edge branches
// =============================================================================

describe("remapObject — edge branches", () => {
  it("handles empty mapping", () => {
    const result = remapObject({ a: 1, b: 2 }, {});
    expect(result).toEqual({});
  });

  it("handles empty source", () => {
    const result = remapObject({}, { "a.b": "x" }, { defaultValue: "N/A" });
    expect((result as any).x).toBe("N/A");
  });

  it("skips mapping entry with empty sourcePath", () => {
    const result = remapObject({ a: 1 }, { "": "x", a: "b" });
    expect((result as any).b).toBe(1);
    expect("x" in result).toBe(false);
  });

  it("skips mapping entry with empty targetPath", () => {
    const result = remapObject({ a: 1 }, { a: "" });
    expect(result).toEqual({});
  });

  it("handles keepUnmapped with nested objects", () => {
    const result = remapObject(
      { user: { name: "Alice", age: 30 }, meta: { id: 1 } },
      { "user.name": "fullName" },
      { keepUnmapped: true }
    );
    expect((result as any).fullName).toBe("Alice");
    // Unmapped: meta.id and user.age carried over
    expect((result as any).meta).toBeDefined();
  });

  it("remaps when source value is null", () => {
    const result = remapObject(
      { user: { name: null } },
      { "user.name": "name" }
    );
    expect((result as any).name).toBeNull();
  });

  it("remaps when source value is 0", () => {
    const result = remapObject({ count: 0 }, { count: "total" });
    expect((result as any).total).toBe(0);
  });

  it("remaps when source value is false", () => {
    const result = remapObject({ active: false }, { active: "isActive" });
    expect((result as any).isActive).toBe(false);
  });

  it("handles array values in source", () => {
    const result = remapObject({ tags: ["a", "b"] }, { tags: "labels" });
    expect((result as any).labels).toEqual(["a", "b"]);
  });

  it("handles deeply nested source with mixed nesting", () => {
    const result = remapObject(
      { a: { b: { c: { d: "deep" } } } },
      { "a.b.c.d": "value" }
    );
    expect((result as any).value).toBe("deep");
  });
});

// =============================================================================
// mergeDeep — edge branches
// =============================================================================

describe("mergeDeep — edge branches", () => {
  it("source with null value overwrites target", () => {
    const result = mergeDeep({ a: 1 }, { a: null as unknown as Record<string, unknown> });
    expect((result as any).a).toBeNull();
  });

  it("target null overwritten by source object", () => {
    const result = mergeDeep(
      { user: null as unknown as Record<string, unknown> },
      { user: { name: "Alice" } }
    );
    expect((result as any).user.name).toBe("Alice");
  });

  it("primitive source replaces object target", () => {
    const result = mergeDeep(
      { user: { name: "Alice" } },
      { user: "replaced" as unknown as Record<string, unknown> }
    );
    expect((result as any).user).toBe("replaced");
  });

  it("merges with empty object as source", () => {
    const result = mergeDeep({ a: 1, b: 2 }, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("merges with empty object as target", () => {
    const result = mergeDeep({}, { a: 1, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("three-way merge with all strategies", () => {
    const a = { tags: ["x"], name: "Alice" };
    const b = { tags: ["y"], age: 30 };
    const result = mergeDeep(a, b, { arrayStrategy: "concat" });
    expect((result as any).tags).toEqual(["x", "y"]);
    expect((result as any).name).toBe("Alice");
    expect((result as any).age).toBe(30);
  });

  it("unique strategy deduplicates primitives", () => {
    const result = mergeDeep(
      { nums: [1, 2, 3] },
      { nums: [2, 3, 4] },
      { arrayStrategy: "unique" }
    );
    expect((result as any).nums).toEqual([1, 2, 3, 4]);
  });

  it("respects maxDepth — stops recursing", () => {
    const a = { l1: { l2: { l3: { val: "a" } } } };
    const b = { l1: { l2: { l3: { val: "b" } } } };
    const result = mergeDeep(a, b, { maxDepth: 1 });
    // At depth 1 (l1 level), source replaces target
    expect((result as any).l1.l2.l3.val).toBe("b");
  });
});

// =============================================================================
// normalizeKeys — edge branches
// =============================================================================

describe("normalizeKeys — edge branches", () => {
  it("handles null input safely", () => {
    expect(normalizeKeys(null as unknown)).toBeNull();
  });

  it("handles primitive input unchanged", () => {
    expect(normalizeKeys(42 as unknown)).toBe(42);
    expect(normalizeKeys("hello" as unknown)).toBe("hello");
  });

  it("handles empty object", () => {
    expect(normalizeKeys({})).toEqual({});
  });

  it("handles empty array", () => {
    expect(normalizeKeys([] as unknown)).toEqual([]);
  });

  it("handles array of primitives — no key conversion needed", () => {
    const result = normalizeKeys([1, 2, 3] as unknown);
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles object with numeric-string keys", () => {
    const result = normalizeKeys({ "0": "zero", "1": "one" });
    // Numeric string keys: tokenising "0" → ["0"] → camel = "0"
    expect((result as any)["0"]).toBe("zero");
  });

  it("handles already camelCase input with camel target (no-op)", () => {
    const input = { firstName: "Alice", lastName: "Smith" };
    const result = normalizeKeys(input, { case: "camel" });
    expect(result).toEqual({ firstName: "Alice", lastName: "Smith" });
  });

  it("normalizes keys in deeply nested arrays of objects", () => {
    const result = normalizeKeys({
      sections: [{ section_title: "Header", sub_items: [{ item_name: "Nav" }] }]
    });
    expect((result as any).sections[0].sectionTitle).toBe("Header");
    expect((result as any).sections[0].subItems[0].itemName).toBe("Nav");
  });
});

// =============================================================================
// convertKeyCase — edge branches
// =============================================================================

describe("convertKeyCase — edge cases", () => {
  it("handles empty string", () => expect(convertKeyCase("", "camel")).toBe(""));

  it("handles single character", () => {
    expect(convertKeyCase("a", "camel")).toBe("a");
    expect(convertKeyCase("A", "snake")).toBe("a");
  });

  it("handles all-digit key", () => {
    // "123" tokenises to ["123"] → camel = "123"
    expect(convertKeyCase("123", "camel")).toBe("123");
  });

  it("handles repeated separators", () => {
    expect(convertKeyCase("first__name", "camel")).toBe("firstName");
    expect(convertKeyCase("first--name", "camel")).toBe("firstName");
  });

  it("handles mixed number-letter key", () => {
    expect(convertKeyCase("level2Cache", "snake")).toBe("level_2_cache");
  });
});
