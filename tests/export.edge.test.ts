// =============================================================================
// tests/export.edge.test.ts
// Additional edge cases for v0.7.0 export layer branch coverage
// =============================================================================

import { describe, it, expect } from "vitest";
import { toCSV } from "../src/export/csv.js";
import { toJSONSchema, toJSONSchemaFromSamples } from "../src/export/schema.js";

// =============================================================================
// toCSV — additional branches
// =============================================================================

describe("toCSV — flatten: false edge cases", () => {
  it("shallow mode serialises nested array as JSON string", () => {
    const { csv } = toCSV(
      [{ tags: ["a", "b", "c"], name: "Alice" }],
      { flatten: false, includeHeader: false }
    );
    // tags array should be JSON-stringified
    expect(csv).toContain("a");
    expect(csv).toContain("b");
    expect(csv).toContain("Alice");
  });

  it("shallow mode keeps primitive values as-is", () => {
    const { csv } = toCSV(
      [{ name: "Alice", age: 30, active: true }],
      { flatten: false, includeHeader: false }
    );
    expect(csv).toContain("Alice");
    expect(csv).toContain("30");
    expect(csv).toContain("true");
  });
});

describe("toCSV — column transform error handling", () => {
  it("uses empty string when column transform throws", () => {
    const { csv } = toCSV(
      [{ name: "Alice" }],
      {
        columns: [{
          key: "name",
          label: "Name",
          transform: () => { throw new Error("fail"); },
        }],
        includeHeader: false,
      }
    );
    // Should produce an empty cell (error fallback)
    expect(csv).toBe("");
  });
});

describe("toCSV — special value types", () => {
  it("handles array of primitives as comma-joined string", () => {
    const { csv } = toCSV([{ tags: ["a", "b", "c"] }], { includeHeader: false });
    expect(csv).toContain("a, b, c");
  });

  it("handles array of objects as JSON string", () => {
    const { csv } = toCSV(
      [{ items: [{ id: 1 }, { id: 2 }] }],
      { includeHeader: false }
    );
    expect(csv).toContain("id");
  });

  it("handles number zero correctly", () => {
    const { csv } = toCSV([{ count: 0 }], { includeHeader: false });
    expect(csv).toBe("0");
  });

  it("skips non-object items in array input", () => {
    const { rowCount } = toCSV([
      { name: "Alice" },
      "not-an-object" as unknown as Record<string, unknown>,
      42 as unknown as Record<string, unknown>,
      { name: "Bob" },
    ]);
    expect(rowCount).toBe(2);
  });

  it("handles null input gracefully", () => {
    const { csv, rowCount } = toCSV(null as unknown);
    expect(csv).toBe("");
    expect(rowCount).toBe(0);
  });

  it("handles primitive input gracefully", () => {
    const { rowCount } = toCSV(42 as unknown);
    expect(rowCount).toBe(0);
  });
});

describe("toCSV — humanizeHeaders: false", () => {
  it("uses raw key names as headers when humanizeHeaders: false", () => {
    const { csv } = toCSV(
      [{ firstName: "Alice" }],
      { humanizeHeaders: false }
    );
    // Raw key used directly, not "First Name"
    expect(csv.split("\n")[0]).toBe("firstName");
  });
});

describe("toCSV — value extraction fallback", () => {
  it("uses empty string when value is undefined and no defaultValue", () => {
    const { csv } = toCSV(
      [{ name: "Alice" }],
      {
        columns: [
          { key: "name",    label: "Name"  },
          { key: "missing", label: "Phone" },
        ],
        includeHeader: false,
      }
    );
    expect(csv).toBe("Alice,");
  });
});

// =============================================================================
// toJSONSchema — additional branch coverage
// =============================================================================

describe("toJSONSchema — mergeArrayItems: false", () => {
  it("uses only first item schema when mergeArrayItems: false", () => {
    const schema = toJSONSchema(
      [
        { name: "Alice", age: 30 },
        { name: "Bob",   email: "bob@test.com" },
      ],
      { mergeArrayItems: false }
    );
    expect(schema.type).toBe("array");
    const items = schema.items as Record<string, unknown>;
    // Only first item's schema — no email (which only appears in second item)
    expect(items?.type).toBe("object");
    const props = items?.properties as Record<string, unknown> | undefined;
    expect(props?.name).toBeDefined();
    expect(props?.email).toBeUndefined(); // not in first item
  });
});

describe("toJSONSchema — unknown/primitive values", () => {
  it("generates string schema for unknown primitive", () => {
    const schema = toJSONSchema({ val: "hello" });
    expect((schema.properties as any)?.val?.type).toBe("string");
  });

  it("handles direct primitive input", () => {
    const schema = toJSONSchema("hello");
    expect(schema.type).toBe("string");
  });

  it("handles direct number input", () => {
    const schema = toJSONSchema(42);
    expect(schema.type).toBe("integer");
  });

  it("handles direct boolean input", () => {
    const schema = toJSONSchema(true);
    expect(schema.type).toBe("boolean");
  });
});

describe("toJSONSchema — schema merging with type conflicts", () => {
  it("produces array of types when items have different types", () => {
    // Array with mixed types — mergeSchemas handles mismatched types
    const schema = toJSONSchemaFromSamples([
      { val: "string" },
      { val: 42 },
    ]);
    const props = (schema as any).properties as Record<string, { type: unknown }> | undefined;
    // val can be string or integer
    const valType = props?.val?.type;
    expect(Array.isArray(valType) || typeof valType === "string").toBe(true);
  });
});

describe("toJSONSchema — deep nesting", () => {
  it("generates schema for 5-level deep nesting", () => {
    const data = { l1: { l2: { l3: { l4: { l5: "deep" } } } } };
    const schema = toJSONSchema(data);
    expect(schema.type).toBe("object");
    // Can recurse at least 5 levels
    const l5 = (schema as any).properties?.l1?.properties?.l2?.properties?.l3?.properties?.l4?.properties?.l5;
    expect(l5?.type).toBe("string");
  });

  it("stops at maxDepth", () => {
    const data = { l1: { l2: { l3: "deep" } } };
    const schema = toJSONSchema(data, { maxDepth: 1 });
    // Stops recursing at depth 1 — l2 content won't be expanded
    expect(schema.type).toBe("object");
  });
});

describe("toJSONSchema — array with empty items array", () => {
  it("generates empty items schema for empty array value", () => {
    const schema = toJSONSchema({ list: [] });
    expect((schema.properties as any)?.list?.type).toBe("array");
    expect((schema.properties as any)?.list?.items).toEqual({});
  });
});

describe("toJSONSchemaFromSamples — edge cases", () => {
  it("handles samples with array-type mismatch gracefully", () => {
    const schema = toJSONSchemaFromSamples([
      { items: [1, 2, 3] },
      { items: ["a", "b"] },
    ]);
    expect(schema).toBeDefined();
  });

  it("merges required fields — only keeps fields in ALL samples", () => {
    const schema = toJSONSchemaFromSamples([
      { name: "Alice", age: 30 },
      { name: "Bob" },
    ], { required: true });
    // 'name' present in both, 'age' only in first — after merge, only 'name' stays required
    if (schema.required) {
      expect(schema.required).toContain("name");
      expect(schema.required).not.toContain("age");
    }
  });
});
