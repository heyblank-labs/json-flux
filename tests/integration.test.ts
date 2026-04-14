// =============================================================================
// tests/integration.test.ts
// End-to-end and performance tests for @heyblank-labs/json-flux v0.1.0
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  flattenObject,
  flattenArray,
  removeNulls,
  deepSafeParse,
  collectAllKeys,
  extractField,
  deepMerge,
  deepEqual,
  isEmpty,
} from "../src/index.js";

// ── Full pipeline ──────────────────────────────────────────────────────────────

describe("Full pipeline: parse → clean → flatten", () => {
  it("processes a double-serialized API response end-to-end", () => {
    // Simulate an enterprise API that double-serializes its response
    const rawApiResponse = JSON.stringify(
      JSON.stringify({
        customer: {
          firstName: "Alice",
          lastName: null,
          address: {
            city: "London",
            zip: "",
          },
          tags: ["premium", "active"],
        },
      })
    );

    const parsed = deepSafeParse(rawApiResponse) as Record<string, unknown>;
    const cleaned = removeNulls(parsed) as Record<string, unknown>;
    const { data } = flattenObject(cleaned);

    expect(data["customer.firstName"]).toBe("Alice");
    expect("customer.lastName" in data).toBe(false); // null removed
    expect("customer.address.zip" in data).toBe(false); // empty string removed
    expect(data["customer.address.city"]).toBe("London");
    expect(data["customer.tags"]).toBe("premium, active");
  });

  it("processes an array of API records", () => {
    const records = [
      { id: 1, user: { name: "Alice", role: null } },
      { id: 2, user: { name: "Bob", role: "admin" } },
    ];

    const cleaned = records.map(
      (r) => removeNulls(r) as Record<string, unknown>
    );
    const { rows, allKeys } = flattenArray(cleaned);

    expect(rows).toHaveLength(2);
    expect(allKeys).toContain("id");
    expect(allKeys).toContain("user.name");
    expect(allKeys).toContain("user.role");
    expect(rows[0]?.["user.role"]).toBeUndefined(); // role was null → removed
    expect(rows[1]?.["user.role"]).toBe("admin");
  });
});

// ── Prototype pollution resistance ─────────────────────────────────────────────

describe("Prototype pollution resistance", () => {
  it("is safe across the full pipeline", () => {
    const malicious =
      '{"__proto__":{"polluted":true},"__proto__":{"evil":"yes"},"safe":1}';

    const parsed = deepSafeParse(malicious) as Record<string, unknown>;
    const cleaned = removeNulls(parsed) as Record<string, unknown>;
    const { data } = flattenObject(cleaned);
    const keys = collectAllKeys(cleaned);

    // No pollution should have occurred on Object.prototype
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["evil"]).toBeUndefined();
    expect(Object.hasOwn(data, "__proto__")).toBe(false);
    expect(keys.keys).not.toContain("__proto__");
    expect(data["safe"]).toBe(1);
  });
});

// ── Large dataset performance ──────────────────────────────────────────────────

describe("Performance: large JSON handling", () => {
  it("flattens 1000-item array in reasonable time", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      user: { name: `User${i}`, age: 20 + (i % 50) },
      active: i % 2 === 0,
      tags: ["a", "b", "c"],
    }));

    const start = performance.now();
    const result = flattenArray(items);
    const duration = performance.now() - start;

    expect(result.rows).toHaveLength(1000);
    expect(duration).toBeLessThan(500); // <500ms for 1k items
  });

  it("flattens 10k-node deeply nested structure", () => {
    const large: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      large[`field_${i}`] = { nested: { value: i, label: `Label ${i}` } };
    }

    const start = performance.now();
    const { leafCount } = flattenObject(large);
    const duration = performance.now() - start;

    expect(leafCount).toBe(2000); // value + label per field
    expect(duration).toBeLessThan(200); // <200ms
  });

  it("removeNulls on 5000-key object", () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) {
      obj[`k${i}`] = i % 3 === 0 ? null : i;
    }

    const start = performance.now();
    const result = removeNulls(obj) as Record<string, unknown>;
    const duration = performance.now() - start;

    expect(Object.keys(result).length).toBe(3333); // 5000 - Math.floor(5000/3) nulls
    expect(duration).toBeLessThan(100);
  });
});

// ── Helpers integration ────────────────────────────────────────────────────────

describe("Helper utilities", () => {
  it("deepMerge merges nested objects correctly", () => {
    const a = { user: { name: "Alice", role: "user" } };
    const b = { user: { role: "admin" }, active: true };
    const merged = deepMerge(a, b);
    expect(merged).toEqual({ user: { name: "Alice", role: "admin" }, active: true });
  });

  it("deepEqual detects equal objects", () => {
    expect(deepEqual({ a: [1, 2, 3] }, { a: [1, 2, 3] })).toBe(true);
  });

  it("deepEqual detects unequal objects", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("isEmpty works for all empty cases", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
    expect(isEmpty(0)).toBe(false);
  });
});

// ── Immutability guarantees ────────────────────────────────────────────────────

describe("Immutability", () => {
  it("flattenObject returns frozen results", () => {
    const result = flattenObject({ a: 1 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
  });

  it("flattenArray returns frozen results", () => {
    const result = flattenArray([{ a: 1 }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
  });

  it("removeNulls does not mutate input", () => {
    const input = { a: null, b: { c: undefined, d: 1 } };
    const before = JSON.stringify(input);
    removeNulls(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("extractField does not mutate the source", () => {
    const source = { user: { name: "Alice" } };
    extractField(source, "user.name");
    expect(source.user.name).toBe("Alice");
  });
});
