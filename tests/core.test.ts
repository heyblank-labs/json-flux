// =============================================================================
// tests/array.test.ts
// =============================================================================

import { describe, it, expect } from "vitest";
import { flattenArray, collectRowKeys } from "../src/core/array.js";

describe("flattenArray", () => {
  it("flattens an array of objects into rows", () => {
    const result = flattenArray([{ name: "Alice" }, { name: "Bob" }]);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]?.["name"]).toBe("Alice");
    expect(result.rows[1]?.["name"]).toBe("Bob");
  });

  it("skips non-plain-object items and reports skippedCount", () => {
    const result = flattenArray([{ a: 1 }, "string", 42, null, { b: 2 }] as never[]);
    expect(result.rows.length).toBe(2);
    expect(result.skippedCount).toBe(3);
  });

  it("uses index prefix when omitIndexPrefix = false", () => {
    const result = flattenArray([{ name: "Alice" }], {}, false);
    expect("0.name" in result.rows[0]!).toBe(true);
  });

  it("collects allKeys across rows", () => {
    const result = flattenArray([{ a: 1 }, { b: 2 }]);
    expect(result.allKeys).toContain("a");
    expect(result.allKeys).toContain("b");
  });

  it("collects arrayObjectPaths from nested rows", () => {
    const result = flattenArray([{ items: [{ id: 1 }] }]);
    expect(result.arrayObjectPaths).toContain("items");
  });

  it("returns empty result for empty array", () => {
    const result = flattenArray([]);
    expect(result.rows.length).toBe(0);
    expect(result.allKeys.length).toBe(0);
  });
});

describe("collectRowKeys", () => {
  it("returns union of all keys across rows", () => {
    const keys = collectRowKeys([{ a: 1, b: 2 }, { b: 3, c: 4 }]);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
  });

  it("returns empty for empty rows", () => {
    expect(collectRowKeys([])).toHaveLength(0);
  });
});


// =============================================================================
// tests/clean.test.ts
// =============================================================================

import { removeNulls, isEmpty } from "../src/core/clean.js";

describe("removeNulls", () => {
  it("removes null values", () => {
    const result = removeNulls({ a: null, b: "hello" });
    expect(result).toEqual({ b: "hello" });
  });

  it("removes undefined values", () => {
    const result = removeNulls({ a: undefined, b: 1 } as Record<string, unknown>);
    expect(result).toEqual({ b: 1 });
  });

  it("removes empty strings by default", () => {
    const result = removeNulls({ a: "", b: "x" });
    expect(result).toEqual({ b: "x" });
  });

  it("keeps empty strings when removeEmptyStrings = false", () => {
    const result = removeNulls({ a: "", b: "x" }, { removeEmptyStrings: false });
    expect(result).toEqual({ a: "", b: "x" });
  });

  it("removes empty objects by default", () => {
    const result = removeNulls({ a: {}, b: 1 });
    expect(result).toEqual({ b: 1 });
  });

  it("removes nulls from nested arrays", () => {
    const result = removeNulls({ tags: [null, "a", null, "b"] });
    expect(result).toEqual({ tags: ["a", "b"] });
  });

  it("removes empty objects from arrays", () => {
    const result = removeNulls({ items: [{}, { id: 1 }] });
    expect(result).toEqual({ items: [{ id: 1 }] });
  });

  it("does NOT mutate input", () => {
    const input = { a: null, b: 1 };
    removeNulls(input);
    expect(input.a).toBeNull();
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    expect(() => removeNulls(obj)).not.toThrow();
  });

  it("keeps 0 and false (valid values)", () => {
    const result = removeNulls({ zero: 0, flag: false });
    expect(result).toEqual({ zero: 0, flag: false });
  });

  it("removes empty arrays when removeEmptyArrays = true", () => {
    const result = removeNulls({ tags: [], name: "Alice" }, { removeEmptyArrays: true });
    expect(result).toEqual({ name: "Alice" });
  });

  it("deeply removes nulls from 5-level nested object — returns undefined when all null", () => {
    const input = { l1: { l2: { l3: { l4: { l5: null } } } } };
    const result = removeNulls(input);
    // All values resolve to null → empty objects removed up the chain → undefined
    expect(result).toBeUndefined();
  });

  it("deeply removes nulls but preserves non-null siblings", () => {
    const input = { l1: { l2: { l3: null, keep: "alive" } } };
    const result = removeNulls(input) as Record<string, unknown>;
    expect(result).toEqual({ l1: { l2: { keep: "alive" } } });
  });
});

describe("isEmpty", () => {
  it("returns true for null", () => expect(isEmpty(null)).toBe(true));
  it("returns true for undefined", () => expect(isEmpty(undefined)).toBe(true));
  it("returns true for empty string", () => expect(isEmpty("")).toBe(true));
  it("returns true for empty array", () => expect(isEmpty([])).toBe(true));
  it("returns true for empty object", () => expect(isEmpty({})).toBe(true));
  it("returns false for 0", () => expect(isEmpty(0)).toBe(false));
  it("returns false for false", () => expect(isEmpty(false)).toBe(false));
  it("returns false for non-empty string", () => expect(isEmpty("x")).toBe(false));
  it("returns false for non-empty array", () => expect(isEmpty([1])).toBe(false));
  it("returns false for non-empty object", () => expect(isEmpty({ a: 1 })).toBe(false));
});


// =============================================================================
// tests/parse.test.ts
// =============================================================================

import { safeParse, deepSafeParse } from "../src/core/parse.js";

describe("safeParse", () => {
  it("parses a simple JSON string", () => {
    expect(safeParse('{"name":"Alice"}')).toEqual({ name: "Alice" });
  });

  it("returns non-strings as-is", () => {
    expect(safeParse(42)).toBe(42);
    expect(safeParse(null)).toBeNull();
    expect(safeParse(true)).toBe(true);
  });

  it("unwraps double-serialized JSON strings", () => {
    const double = JSON.stringify(JSON.stringify({ a: 1 }));
    expect(safeParse(double)).toEqual({ a: 1 });
  });

  it("returns original string for plain non-JSON strings", () => {
    expect(safeParse("hello world")).toBe("hello world");
  });

  it("returns original string for malformed JSON", () => {
    expect(safeParse("{invalid json}")).toBe("{invalid json}");
  });

  it("does not throw on malformed JSON", () => {
    expect(() => safeParse("{bad}")).not.toThrow();
  });

  it("drops __proto__ after parsing to prevent prototype pollution", () => {
    const payload = '{"__proto__":{"x":1},"safe":true}';
    const result = safeParse(payload) as Record<string, unknown>;
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(result["safe"]).toBe(true);
    expect(Object.hasOwn({}, "x")).toBe(false);
  });

  it("throws on pollution when throwOnPollution = true", () => {
    const payload = '{"__proto__":{"x":1}}';
    expect(() =>
      safeParse(payload, { throwOnPollution: true })
    ).toThrow(/prototype pollution/i);
  });

  it("handles JSON boolean literals", () => {
    expect(safeParse("true")).toBe(true);
    expect(safeParse("false")).toBe(false);
  });

  it("handles JSON null literal", () => {
    expect(safeParse("null")).toBeNull();
  });
});

describe("deepSafeParse", () => {
  it("recursively parses nested JSON strings", () => {
    const input = { user: '{"name":"Alice"}' };
    expect(deepSafeParse(input)).toEqual({ user: { name: "Alice" } });
  });

  it("parses arrays of JSON strings", () => {
    const input = ['{"id":1}', '{"id":2}'];
    expect(deepSafeParse(input)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("handles triple-serialized JSON", () => {
    const triple = JSON.stringify(JSON.stringify(JSON.stringify({ deep: true })));
    expect(deepSafeParse(triple)).toEqual({ deep: true });
  });

  it("does not mutate input", () => {
    const input = { a: '{"x":1}' };
    const copy = { ...input };
    deepSafeParse(input);
    expect(input).toEqual(copy);
  });
});


// =============================================================================
// tests/keys.test.ts
// =============================================================================

import { collectAllKeys } from "../src/core/keys.js";

describe("collectAllKeys", () => {
  it("collects all unique bare keys", () => {
    const result = collectAllKeys({ a: 1, b: { c: 2, d: 3 } });
    expect(result.keys).toContain("a");
    expect(result.keys).toContain("b");
    expect(result.keys).toContain("c");
    expect(result.keys).toContain("d");
  });

  it("returns dot-notation paths when dotNotation = true", () => {
    const result = collectAllKeys({ user: { name: "Alice" } }, { dotNotation: true });
    expect(result.keys).toContain("user");
    expect(result.keys).toContain("user.name");
  });

  it("returns unique keys (no duplicates across branches)", () => {
    const result = collectAllKeys({ a: { id: 1 }, b: { id: 2 } });
    const idCount = result.keys.filter((k) => k === "id").length;
    expect(idCount).toBe(1);
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    expect(() => collectAllKeys(obj)).not.toThrow();
  });

  it("returns totalNodes count", () => {
    const result = collectAllKeys({ a: 1, b: 2 });
    expect(result.totalNodes).toBe(2);
  });

  it("drops unsafe keys", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":1}') as Record<string, unknown>;
    const result = collectAllKeys(malicious);
    expect(result.keys).not.toContain("__proto__");
    expect(result.keys).toContain("safe");
  });

  it("returns empty for empty object", () => {
    const result = collectAllKeys({});
    expect(result.keys).toHaveLength(0);
  });
});


// =============================================================================
// tests/extract.test.ts
// =============================================================================

import { extractField, hasField, parsePath } from "../src/core/extract.js";

describe("parsePath", () => {
  it("parses simple dot path", () => {
    expect(parsePath("a.b.c")).toEqual(["a", "b", "c"]);
  });

  it("parses array index notation", () => {
    expect(parsePath("users[0].name")).toEqual(["users", 0, "name"]);
  });

  it("parses nested bracket notation", () => {
    expect(parsePath("[0][1]")).toEqual([0, 1]);
  });

  it("parses mixed notation", () => {
    expect(parsePath("data[0].items[2].id")).toEqual(["data", 0, "items", 2, "id"]);
  });

  it("returns single segment for bare key", () => {
    expect(parsePath("name")).toEqual(["name"]);
  });
});

describe("extractField", () => {
  const data = {
    user: { name: "Alice", age: 30 },
    tags: ["ts", "json"],
    nested: { items: [{ id: 1, label: "first" }, { id: 2, label: "second" }] },
  };

  it("extracts a shallow key", () => {
    expect(extractField(data, "user")).toEqual({ name: "Alice", age: 30 });
  });

  it("extracts a dot-notation path", () => {
    expect(extractField(data, "user.name")).toBe("Alice");
  });

  it("extracts an array element by index", () => {
    expect(extractField(data, "tags[0]")).toBe("ts");
  });

  it("extracts deeply nested value with mixed notation", () => {
    expect(extractField(data, "nested.items[1].label")).toBe("second");
  });

  it("returns undefined for missing path", () => {
    expect(extractField(data, "user.missing")).toBeUndefined();
  });

  it("returns defaultValue for missing path", () => {
    expect(extractField(data, "x.y.z", { defaultValue: "N/A" })).toBe("N/A");
  });

  it("returns undefined for null input", () => {
    expect(extractField(null, "a.b")).toBeUndefined();
  });

  it("does not access __proto__", () => {
    expect(extractField({}, "__proto__")).toBeUndefined();
  });

  it("returns null when path points to null value", () => {
    expect(extractField({ a: null }, "a")).toBeNull();
  });
});

describe("hasField", () => {
  it("returns true for existing path", () => {
    expect(hasField({ a: { b: 1 } }, "a.b")).toBe(true);
  });

  it("returns true even when value is null", () => {
    expect(hasField({ a: { b: null } }, "a.b")).toBe(true);
  });

  it("returns false for missing path", () => {
    expect(hasField({ a: 1 }, "a.b")).toBe(false);
  });

  it("returns false for null input", () => {
    expect(hasField(null, "a")).toBe(false);
  });

  it("blocks __proto__ path access", () => {
    expect(hasField({}, "__proto__")).toBe(false);
  });
});
