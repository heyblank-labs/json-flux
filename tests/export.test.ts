// =============================================================================
// tests/export.test.ts
// Full test suite for v0.7.0 — Export Layer (CSV + JSON Schema)
// =============================================================================

import { describe, it, expect } from "vitest";
import { toCSV, toCsvString } from "../src/export/csv.js";
import { toJSONSchema, toJSONSchemaFromSamples } from "../src/export/schema.js";

// =============================================================================
// toCSV — basic
// =============================================================================

describe("toCSV — basic", () => {
  it("converts array of objects to CSV", () => {
    const { csv, rowCount } = toCSV([
      { name: "Alice", age: 30 },
      { name: "Bob",   age: 25 },
    ]);
    expect(csv).toContain("Alice");
    expect(csv).toContain("Bob");
    expect(rowCount).toBe(2);
  });

  it("includes header row by default", () => {
    const { csv } = toCSV([{ name: "Alice", age: 30 }]);
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Header should be human-readable (humanizeHeaders: true by default)
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Age");
  });

  it("omits header when includeHeader: false", () => {
    const { csv } = toCSV([{ name: "Alice" }], { includeHeader: false });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Alice");
  });

  it("uses comma delimiter by default", () => {
    const { csv } = toCSV([{ a: 1, b: 2 }], { includeHeader: false });
    expect(csv).toContain(",");
  });

  it("uses semicolon delimiter", () => {
    const { csv } = toCSV([{ a: 1, b: 2 }], { delimiter: ";", includeHeader: false });
    expect(csv).toContain(";");
    expect(csv).not.toContain(",");
  });

  it("uses tab delimiter", () => {
    const { csv } = toCSV([{ a: 1, b: 2 }], { delimiter: "\t", includeHeader: false });
    expect(csv).toContain("\t");
  });

  it("returns empty csv for empty array", () => {
    const { csv, rowCount } = toCSV([]);
    expect(csv).toBe("");
    expect(rowCount).toBe(0);
  });

  it("handles single object input (not array)", () => {
    const { csv, rowCount } = toCSV({ name: "Alice", age: 30 });
    expect(rowCount).toBe(1);
    expect(csv).toContain("Alice");
  });

  it("reports columns in result", () => {
    const { columns } = toCSV([{ name: "Alice", age: 30 }]);
    expect(columns).toContain("name");
    expect(columns).toContain("age");
  });

  it("returns frozen result", () => {
    const result = toCSV([{ a: 1 }]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// =============================================================================
// toCSV — nested objects (flatten)
// =============================================================================

describe("toCSV — nested object flattening", () => {
  it("flattens nested objects to dot-notation columns", () => {
    const { csv } = toCSV(
      [{ user: { name: "Alice", address: { city: "London" } } }],
      { includeHeader: true, humanizeHeaders: false }
    );
    expect(csv).toContain("user.name");
    expect(csv).toContain("user.address.city");
    expect(csv).toContain("Alice");
    expect(csv).toContain("London");
  });

  it("does not flatten when flatten: false", () => {
    const { csv } = toCSV(
      [{ user: { name: "Alice" } }],
      { flatten: false, includeHeader: false }
    );
    // RFC-4180: JSON value containing quotes is wrapped in quotes with internal quotes doubled
    // {"name":"Alice"} → "{""name"":""Alice""}"
    expect(csv).toContain("name");
    expect(csv).toContain("Alice");
    // Key should NOT be "user.name" — it's the "user" top-level key
    expect(csv).not.toContain("user.name");
  });
});

// =============================================================================
// toCSV — explicit column config
// =============================================================================

describe("toCSV — column config", () => {
  const data = [
    { user: { name: "Alice", email: "alice@test.com", age: 30 } },
    { user: { name: "Bob",   email: "bob@test.com",   age: 25 } },
  ];

  it("uses only specified columns", () => {
    const { csv, columns } = toCSV(data, {
      columns: [
        { key: "user.name",  label: "Name"  },
        { key: "user.email", label: "Email" },
      ],
    });
    expect(columns).toEqual(["user.name", "user.email"]);
    expect(csv).toContain("Alice");
    expect(csv).not.toContain("30"); // age excluded
  });

  it("uses explicit label over humanized header", () => {
    const { csv } = toCSV(data, {
      columns: [{ key: "user.name", label: "Full Name" }],
    });
    expect(csv.split("\n")[0]).toContain("Full Name");
  });

  it("applies column transform", () => {
    const { csv } = toCSV(data, {
      columns: [{
        key: "user.age",
        label: "Age",
        transform: (v) => `${v} years`,
      }],
      includeHeader: false,
    });
    expect(csv).toContain("30 years");
    expect(csv).toContain("25 years");
  });

  it("uses defaultValue for missing column", () => {
    const { csv } = toCSV(
      [{ user: { name: "Alice" } }],
      {
        columns: [
          { key: "user.name",  label: "Name"  },
          { key: "user.phone", label: "Phone", defaultValue: "N/A" },
        ],
        includeHeader: false,
      }
    );
    expect(csv).toContain("N/A");
  });
});

// =============================================================================
// toCSV — security: escaping and injection prevention
// =============================================================================

describe("toCSV — CSV escaping", () => {
  it("wraps fields containing delimiter in quotes", () => {
    const { csv } = toCSV([{ name: "Smith, John" }], { includeHeader: false });
    expect(csv).toContain('"Smith, John"');
  });

  it("escapes internal quotes by doubling", () => {
    const { csv } = toCSV([{ name: 'He said "hello"' }], { includeHeader: false });
    expect(csv).toContain('He said ""hello""');
  });

  it("normalises newlines inside values to spaces", () => {
    const { csv } = toCSV([{ notes: "line1\nline2" }], { includeHeader: false });
    expect(csv).not.toContain("line1\nline2");
    expect(csv).toContain("line1 line2");
  });

  it("prevents CSV injection for = prefix", () => {
    const { csv } = toCSV([{ formula: "=SUM(A1:A10)" }], { includeHeader: false });
    expect(csv).toContain("'=SUM");
    expect(csv).not.toMatch(/^=SUM/m);
  });

  it("prevents CSV injection for + prefix", () => {
    const { csv } = toCSV([{ val: "+cmd|' /C..." }], { includeHeader: false });
    expect(csv).toContain("'+cmd");
  });

  it("prevents injection for @ prefix", () => {
    const { csv } = toCSV([{ val: "@SUM(1+1)" }], { includeHeader: false });
    expect(csv).toContain("'@SUM");
  });

  it("disables injection prevention when preventInjection: false", () => {
    const { csv } = toCSV(
      [{ val: "=SUM(A1)" }],
      { preventInjection: false, includeHeader: false }
    );
    expect(csv).toBe("=SUM(A1)");
  });

  it("handles null values as empty string", () => {
    const { csv } = toCSV([{ name: null, age: 30 }], { includeHeader: false });
    const parts = csv.split(",");
    expect(parts[0]).toBe(""); // null → empty
    expect(parts[1]).toBe("30");
  });

  it("handles boolean values", () => {
    const { csv } = toCSV([{ active: true, blocked: false }], { includeHeader: false });
    expect(csv).toContain("true");
    expect(csv).toContain("false");
  });
});

// =============================================================================
// toCSV — CRLF line break
// =============================================================================

describe("toCSV — line breaks", () => {
  it("uses LF by default", () => {
    const { csv } = toCSV([{ a: 1 }, { b: 2 }]);
    expect(csv).toContain("\n");
    expect(csv).not.toContain("\r\n");
  });

  it("uses CRLF when specified", () => {
    const { csv } = toCSV([{ a: 1 }, { b: 2 }], { lineBreak: "\r\n" });
    expect(csv).toContain("\r\n");
  });
});

// =============================================================================
// toCsvString
// =============================================================================

describe("toCsvString", () => {
  it("returns CSV string directly", () => {
    const csv = toCsvString([{ name: "Alice" }], { includeHeader: false });
    expect(typeof csv).toBe("string");
    expect(csv).toBe("Alice");
  });
});

// =============================================================================
// toJSONSchema — basic type inference
// =============================================================================

describe("toJSONSchema — type inference", () => {
  it("infers string type", () => {
    const schema = toJSONSchema({ name: "Alice" });
    expect((schema.properties as any)?.name?.type).toBe("string");
  });

  it("infers integer type", () => {
    const schema = toJSONSchema({ age: 30 });
    expect((schema.properties as any)?.age?.type).toBe("integer");
  });

  it("infers number type for floats", () => {
    const schema = toJSONSchema({ score: 3.14 });
    expect((schema.properties as any)?.score?.type).toBe("number");
  });

  it("infers boolean type", () => {
    const schema = toJSONSchema({ active: true });
    expect((schema.properties as any)?.active?.type).toBe("boolean");
  });

  it("infers null type", () => {
    const schema = toJSONSchema({ missing: null });
    expect((schema.properties as any)?.missing?.type).toBe("null");
  });

  it("infers array type with items", () => {
    const schema = toJSONSchema({ tags: ["a", "b", "c"] });
    expect((schema.properties as any)?.tags?.type).toBe("array");
    expect((schema.properties as any)?.tags?.items?.type).toBe("string");
  });

  it("infers nested object", () => {
    const schema = toJSONSchema({ user: { name: "Alice" } });
    expect((schema.properties as any)?.user?.type).toBe("object");
    expect((schema.properties as any)?.user?.properties?.name?.type).toBe("string");
  });

  it("always emits root object type", () => {
    const schema = toJSONSchema({ a: 1 });
    expect(schema.type).toBe("object");
  });

  it("emits $schema URI", () => {
    const schema = toJSONSchema({});
    expect(schema.$schema).toContain("json-schema");
  });
});

// =============================================================================
// toJSONSchema — format detection
// =============================================================================

describe("toJSONSchema — format detection", () => {
  it("detects email format", () => {
    const schema = toJSONSchema({ email: "alice@example.com" });
    expect((schema.properties as any)?.email?.format).toBe("email");
  });

  it("detects date-time format", () => {
    const schema = toJSONSchema({ createdAt: "2024-01-15T10:30:00Z" });
    expect((schema.properties as any)?.createdAt?.format).toBe("date-time");
  });

  it("detects date format", () => {
    const schema = toJSONSchema({ dob: "2024-01-15" });
    expect((schema.properties as any)?.dob?.format).toBe("date");
  });

  it("detects uri format", () => {
    const schema = toJSONSchema({ website: "https://example.com" });
    expect((schema.properties as any)?.website?.format).toBe("uri");
  });

  it("detects uuid format", () => {
    const schema = toJSONSchema({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect((schema.properties as any)?.id?.format).toBe("uuid");
  });
});

// =============================================================================
// toJSONSchema — options
// =============================================================================

describe("toJSONSchema — required option", () => {
  it("adds required array when required: true", () => {
    const schema = toJSONSchema({ name: "Alice", age: 30 }, { required: true });
    expect(schema.required).toBeDefined();
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("age");
  });

  it("does not add required for null fields", () => {
    const schema = toJSONSchema({ name: "Alice", missing: null }, { required: true });
    expect(schema.required).toContain("name");
    expect(schema.required).not.toContain("missing");
  });

  it("no required array by default", () => {
    const schema = toJSONSchema({ name: "Alice" });
    expect(schema.required).toBeUndefined();
  });
});

describe("toJSONSchema — strict option", () => {
  it("adds additionalProperties: false when strict: true", () => {
    const schema = toJSONSchema({ name: "Alice" }, { strict: true });
    expect(schema.additionalProperties).toBe(false);
  });

  it("no additionalProperties by default", () => {
    const schema = toJSONSchema({ name: "Alice" });
    expect(schema.additionalProperties).toBeUndefined();
  });
});

describe("toJSONSchema — draft versions", () => {
  it("uses draft-07 $schema by default", () => {
    const schema = toJSONSchema({});
    expect(schema.$schema).toContain("draft-07");
  });

  it("uses draft-2019-09 $schema", () => {
    const schema = toJSONSchema({}, { draft: "draft-2019-09" });
    expect(schema.$schema).toContain("2019-09");
  });

  it("uses draft-2020-12 $schema", () => {
    const schema = toJSONSchema({}, { draft: "draft-2020-12" });
    expect(schema.$schema).toContain("2020-12");
  });
});

describe("toJSONSchema — title and description", () => {
  it("adds title to root schema", () => {
    const schema = toJSONSchema({ a: 1 }, { title: "My Schema" });
    expect(schema.title).toBe("My Schema");
  });

  it("adds description to root schema", () => {
    const schema = toJSONSchema({ a: 1 }, { description: "A test schema" });
    expect(schema.description).toBe("A test schema");
  });
});

describe("toJSONSchema — examples", () => {
  it("includes examples when includeExamples: true", () => {
    const schema = toJSONSchema({ name: "Alice" }, { includeExamples: true });
    expect((schema.properties as any)?.name?.examples).toBeDefined();
    expect((schema.properties as any)?.name?.examples[0]).toBe("Alice");
  });

  it("no examples by default", () => {
    const schema = toJSONSchema({ name: "Alice" });
    expect((schema.properties as any)?.name?.examples).toBeUndefined();
  });
});

describe("toJSONSchema — array input", () => {
  it("generates schema from array of objects (merged)", () => {
    const schema = toJSONSchema([
      { name: "Alice", age: 30 },
      { name: "Bob",   age: 25, email: "bob@test.com" },
    ]);
    expect(schema.type).toBe("array");
    expect((schema.items as any)?.type).toBe("object");
    // Merged schema should have all keys from both items
    expect((schema.items as any)?.properties?.name).toBeDefined();
    expect((schema.items as any)?.properties?.age).toBeDefined();
    expect((schema.items as any)?.properties?.email).toBeDefined();
  });
});

describe("toJSONSchema — edge cases", () => {
  it("handles empty object", () => {
    const schema = toJSONSchema({});
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
  });

  it("handles empty array", () => {
    const schema = toJSONSchema([]);
    expect(schema.type).toBe("array");
    expect((schema.items as any)).toEqual({});
  });

  it("handles null input", () => {
    const schema = toJSONSchema(null);
    expect(schema.type).toBe("null");
  });

  it("returns frozen result", () => {
    const schema = toJSONSchema({ a: 1 });
    expect(Object.isFrozen(schema)).toBe(true);
  });

  it("drops unsafe keys from schema", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":"val"}') as Record<string, unknown>;
    const schema = toJSONSchema(malicious);
    // __proto__ as OWN property on generated properties object should be absent
    const props = schema.properties as Record<string, unknown> | undefined;
    if (props) {
      expect(Object.hasOwn(props, "__proto__")).toBe(false);
    }
    expect((schema.properties as any)?.safe).toBeDefined();
  });
});

// =============================================================================
// toJSONSchemaFromSamples
// =============================================================================

describe("toJSONSchemaFromSamples", () => {
  it("merges schemas from multiple samples", () => {
    const schema = toJSONSchemaFromSamples([
      { name: "Alice", age: 30 },
      { name: "Bob",   email: "bob@test.com" },
    ]);
    const props = schema.properties as Record<string, { type: string }>;
    expect(props?.name?.type).toBe("string");
    expect(props?.age?.type).toBe("integer");
    expect(props?.email?.type).toBe("string");
  });

  it("returns schema for single sample", () => {
    const schema = toJSONSchemaFromSamples([{ a: 1 }]);
    expect(schema.type).toBeDefined();
  });

  it("returns empty schema for no samples", () => {
    const schema = toJSONSchemaFromSamples([]);
    expect(schema).toBeDefined();
  });

  it("applies options", () => {
    const schema = toJSONSchemaFromSamples(
      [{ name: "Alice" }],
      { title: "Sample", required: true }
    );
    expect(schema.title).toBe("Sample");
  });
});

// =============================================================================
// Pipeline integration
// =============================================================================

import { transformValuesDirect } from "../src/value/transform.js";
import { maskSensitiveDirect } from "../src/security/mask.js";
import { excludeKeysDirect } from "../src/filter/exclude.js";

describe("export — pipeline integration", () => {
  it("works after transformValues", () => {
    const data = [
      { user: { name: "Alice", dob: "1990-01-15", salary: 75000, ssn: "123-45-6789" } },
      { user: { name: "Bob",   dob: "1985-06-20", salary: 60000, ssn: "987-65-4321" } },
    ];

    // Step 1: mask sensitive data
    const masked = maskSensitiveDirect(data, { fields: ["**.ssn"], mode: "full" });

    // Step 2: transform values — bare key matches at any depth
    const transformed = transformValuesDirect(masked, {
      transforms: {
        dob:    { type: "date", options: { format: "DD MMM YYYY" } },
        salary: { type: "currency", options: { currency: "USD" } },
      },
    });

    // Step 3: export to CSV
    const { csv, rowCount } = toCSV(transformed, {
      columns: [
        { key: "user.name",   label: "Name"   },
        { key: "user.dob",    label: "DOB"    },
        { key: "user.salary", label: "Salary" },
        { key: "user.ssn",    label: "SSN"    },
      ],
    });

    expect(rowCount).toBe(2);
    expect(csv).toContain("Alice");
    expect(csv).toContain("Jan"); // formatted date
    expect(csv).toContain("$");  // formatted currency
    expect(csv).not.toContain("123-45-6789"); // SSN was masked
  });

  it("generates schema from filtered data", () => {
    const data = { user: { name: "Alice", age: 30, password: "secret" } };
    const clean = excludeKeysDirect(data, ["**.password"]);
    const schema = toJSONSchema(clean);
    expect((schema.properties as any)?.user?.properties?.password).toBeUndefined();
    expect((schema.properties as any)?.user?.properties?.name).toBeDefined();
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("export — performance", () => {
  it("toCSV handles 5000-row array within 500ms", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: i, name: `User${i}`, email: `user${i}@test.com`,
      age: 20 + (i % 50), active: i % 2 === 0,
    }));
    const start = performance.now();
    const { rowCount } = toCSV(rows);
    const duration = performance.now() - start;
    expect(rowCount).toBe(5000);
    expect(duration).toBeLessThan(500);
  });

  it("toJSONSchema handles deeply nested object within 50ms", () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      data[`field${i}`] = { value: i, label: `Label ${i}`, active: i % 2 === 0 };
    }
    const start = performance.now();
    toJSONSchema(data);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
