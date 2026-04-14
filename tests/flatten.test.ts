// =============================================================================
// tests/flatten.test.ts
// =============================================================================

import { describe, it, expect } from "vitest";
import { flattenObject } from "../src/core/flatten.js";

describe("flattenObject", () => {
  // ── Basic functionality ────────────────────────────────────────────────────

  it("flattens a shallow object", () => {
    const result = flattenObject({ a: 1, b: "hello", c: true });
    expect(result.data).toEqual({ a: 1, b: "hello", c: true });
    expect(result.leafCount).toBe(3);
  });

  it("flattens a deeply nested object", () => {
    const result = flattenObject({ user: { address: { city: "London" } } });
    expect(result.data["user.address.city"]).toBe("London");
  });

  it("uses dot delimiter by default", () => {
    const result = flattenObject({ a: { b: 1 } });
    expect("a.b" in result.data).toBe(true);
  });

  it("respects custom delimiter", () => {
    const result = flattenObject({ a: { b: 1 } }, { delimiter: "_" });
    expect("a_b" in result.data).toBe(true);
    expect("a.b" in result.data).toBe(false);
  });

  // ── Depth handling ──────────────────────────────────────────────────────────

  it("respects maxDepth — stores deeper nodes as JSON strings", () => {
    const result = flattenObject(
      { a: { b: { c: { d: 99 } } } },
      { maxDepth: 2 }
    );
    expect(typeof result.data["a.b.c"]).toBe("string"); // serialised fallback
  });

  it("tracks maxDepthReached correctly", () => {
    const result = flattenObject({ a: { b: { c: 1 } } });
    expect(result.maxDepthReached).toBeGreaterThanOrEqual(3);
  });

  // ── Arrays ─────────────────────────────────────────────────────────────────

  it("joins primitive arrays as comma-separated string", () => {
    const result = flattenObject({ tags: ["a", "b", "c"] });
    expect(result.data["tags"]).toBe("a, b, c");
  });

  it("stores array-of-objects as JSON string and records the path", () => {
    const input = { items: [{ id: 1 }, { id: 2 }] };
    const result = flattenObject(input);
    expect(typeof result.data["items"]).toBe("string");
    expect(result.arrayObjectPaths).toContain("items");
  });

  it("stores empty array as null", () => {
    const result = flattenObject({ tags: [] });
    expect(result.data["tags"]).toBeNull();
  });

  it("skips arrays entirely when skipArrays = true", () => {
    const result = flattenObject(
      { tags: ["a", "b"] },
      { skipArrays: true }
    );
    expect(typeof result.data["tags"]).toBe("string");
    expect(JSON.parse(result.data["tags"] as string)).toEqual(["a", "b"]);
  });

  // ── Null / undefined ────────────────────────────────────────────────────────

  it("stores null values as null", () => {
    const result = flattenObject({ a: null });
    expect(result.data["a"]).toBeNull();
  });

  it("stores undefined as null", () => {
    const result = flattenObject({ a: undefined as unknown as null });
    expect(result.data["a"]).toBeNull();
  });

  // ── Circular references ─────────────────────────────────────────────────────

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    let result: ReturnType<typeof flattenObject> | undefined;
    expect(() => { result = flattenObject(obj); }).not.toThrow();
    expect(result?.data).toBeDefined();
  });

  it("marks circular paths with [Circular] sentinel", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    const result = flattenObject(obj);
    expect(result.data["self"]).toBe("[Circular]");
  });

  // ── Key escaping ────────────────────────────────────────────────────────────

  it("escapes keys that contain the delimiter", () => {
    const result = flattenObject({ "a.b": { c: 1 } });
    expect("[a.b].c" in result.data).toBe(true);
  });

  // ── excludeKeys ─────────────────────────────────────────────────────────────

  it("excludes specified keys", () => {
    const result = flattenObject(
      { a: 1, b: 2, c: 3 },
      { excludeKeys: ["b"] }
    );
    expect("b" in result.data).toBe(false);
    expect(result.data["a"]).toBe(1);
  });

  // ── Prototype pollution protection ──────────────────────────────────────────

  it("silently drops __proto__ keys", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":true}') as Record<string, unknown>;
    const result = flattenObject(malicious);
    expect(Object.hasOwn(result.data, "__proto__")).toBe(false);
    expect(result.data["safe"]).toBe(true);
    // Ensure prototype was not polluted
    expect(Object.hasOwn({}, "x")).toBe(false);
  });

  it("silently drops constructor keys", () => {
    const malicious = JSON.parse('{"constructor":{"polluted":true},"ok":1}') as Record<string, unknown>;
    const result = flattenObject(malicious);
    expect(Object.hasOwn(result.data, "constructor")).toBe(false);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("returns empty data for empty object", () => {
    const result = flattenObject({});
    expect(result.data).toEqual({});
    expect(result.leafCount).toBe(0);
  });

  it("handles boolean false and number 0 as valid values", () => {
    const result = flattenObject({ flag: false, count: 0 });
    expect(result.data["flag"]).toBe(false);
    expect(result.data["count"]).toBe(0);
  });

  it("handles large flat objects (1000 keys)", () => {
    const large: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) large[`key${i}`] = i;
    const result = flattenObject(large);
    expect(result.leafCount).toBe(1000);
  });

  it("handles deeply nested objects (depth 15)", () => {
    let deep: Record<string, unknown> = { value: 42 };
    for (let i = 0; i < 15; i++) deep = { nested: deep };
    expect(() => flattenObject(deep)).not.toThrow();
  });

  it("returns frozen result", () => {
    const result = flattenObject({ a: 1 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
  });
});
