// =============================================================================
// tests/section.test.ts
// Tests for normalizeToSections(), flattenSectionsToFields(), mergeSections()
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeToSections,
  flattenSectionsToFields,
  mergeSections,
} from "../src/transform/section.js";
import { clearLabelCache } from "../src/transform/label.js";
import type { Section } from "../src/types/section.types.js";

beforeEach(() => clearLabelCache());

// ── Basic structure output ───────────────────────────────────────────────────

describe("normalizeToSections — basic structure", () => {
  it("creates one section per top-level object key", () => {
    const { sections } = normalizeToSections({
      user: { name: "Alice" },
      address: { city: "London" },
    });
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toContain("User");
    expect(sections.map((s) => s.title)).toContain("Address");
  });

  it("creates fields with correct labels and values", () => {
    const { sections } = normalizeToSections({
      user: { firstName: "Alice", age: 30 },
    });
    const fields = sections[0]?.fields ?? [];
    const nameField = fields.find((f) => f.key === "firstName");
    expect(nameField?.label).toBe("First Name");
    expect(nameField?.value).toBe("Alice");
  });

  it("sets correct dot-notation paths on fields", () => {
    const { sections } = normalizeToSections({
      user: { firstName: "Alice" },
    });
    const field = sections[0]?.fields[0];
    expect(field?.path).toBe("user.firstName");
  });

  it("sets correct key on fields", () => {
    const { sections } = normalizeToSections({ user: { age: 30 } });
    const field = sections[0]?.fields[0];
    expect(field?.key).toBe("age");
  });

  it("classifies field types correctly", () => {
    const { sections } = normalizeToSections({
      user: {
        name: "Alice",
        age: 30,
        active: true,
        score: null,
        tags: ["a", "b"],
      },
    });
    const fields = sections[0]?.fields ?? [];
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey["name"]?.type).toBe("primitive");
    expect(byKey["age"]?.type).toBe("primitive");
    expect(byKey["active"]?.type).toBe("primitive");
    expect(byKey["tags"]?.type).toBe("array");
  });

  it("returns totalFields count", () => {
    const { totalFields } = normalizeToSections({
      user: { name: "Alice", age: 30 },
      meta: { created: "2024-01-01" },
    });
    expect(totalFields).toBe(3);
  });

  it("returns processedPaths", () => {
    const { processedPaths } = normalizeToSections({
      user: { name: "Alice" },
    });
    expect(processedPaths).toContain("user.name");
  });

  it("returns frozen result", () => {
    const result = normalizeToSections({ user: { name: "Alice" } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sections)).toBe(true);
  });
});

// ── Null handling ─────────────────────────────────────────────────────────────

describe("normalizeToSections — null handling", () => {
  it("excludes null fields by default", () => {
    const { sections } = normalizeToSections({
      user: { name: "Alice", missing: null },
    });
    const fields = sections[0]?.fields ?? [];
    expect(fields.find((f) => f.key === "missing")).toBeUndefined();
    expect(fields.find((f) => f.key === "name")).toBeDefined();
  });

  it("includes null fields when includeNulls = true", () => {
    const { sections } = normalizeToSections(
      { user: { name: "Alice", missing: null } },
      { includeNulls: true }
    );
    const fields = sections[0]?.fields ?? [];
    const nullField = fields.find((f) => f.key === "missing");
    expect(nullField).toBeDefined();
    expect(nullField?.type).toBe("null");
  });
});

// ── Section mapping ──────────────────────────────────────────────────────────

describe("normalizeToSections — sectionMap", () => {
  it("applies string sectionMap to rename section title", () => {
    const { sections } = normalizeToSections(
      { user: { name: "Alice" } },
      { sectionMap: { user: "User Information" } }
    );
    expect(sections[0]?.title).toBe("User Information");
  });

  it("applies object sectionMap with title", () => {
    const { sections } = normalizeToSections(
      { address: { city: "London" } },
      { sectionMap: { address: { title: "Postal Address" } } }
    );
    expect(sections[0]?.title).toBe("Postal Address");
  });

  it("respects includeFields in sectionMap", () => {
    const { sections } = normalizeToSections(
      { user: { name: "Alice", age: 30, email: "a@b.com" } },
      { sectionMap: { user: { includeFields: ["name", "email"] } } }
    );
    const fields = sections[0]?.fields ?? [];
    expect(fields.find((f) => f.key === "name")).toBeDefined();
    expect(fields.find((f) => f.key === "email")).toBeDefined();
    expect(fields.find((f) => f.key === "age")).toBeUndefined();
  });

  it("respects excludeFields in sectionMap", () => {
    const { sections } = normalizeToSections(
      { user: { name: "Alice", age: 30, internalId: "x" } },
      { sectionMap: { user: { excludeFields: ["internalId"] } } }
    );
    const fields = sections[0]?.fields ?? [];
    expect(fields.find((f) => f.key === "internalId")).toBeUndefined();
    expect(fields.find((f) => f.key === "name")).toBeDefined();
  });
});

// ── Key filtering ────────────────────────────────────────────────────────────

describe("normalizeToSections — key filtering", () => {
  it("excludes keys listed in excludeKeys", () => {
    const { sections } = normalizeToSections(
      { user: { name: "Alice" }, internal: { id: "x" } },
      { excludeKeys: ["internal"] }
    );
    expect(sections.find((s) => s.path === "internal")).toBeUndefined();
    expect(sections.find((s) => s.path === "user")).toBeDefined();
  });

  it("includes only keys in includeKeys whitelist", () => {
    const { sections } = normalizeToSections(
      {
        user: { name: "Alice" },
        address: { city: "London" },
        meta: { id: 1 },
      },
      { includeKeys: ["user", "address"] }
    );
    expect(sections.map((s) => s.path)).toContain("user");
    expect(sections.map((s) => s.path)).toContain("address");
    expect(sections.map((s) => s.path)).not.toContain("meta");
  });

  it("drops unsafe keys silently", () => {
    const malicious = JSON.parse(
      '{"__proto__":{"x":1},"user":{"name":"Alice"}}'
    ) as Record<string, unknown>;
    const { sections } = normalizeToSections(malicious);
    expect(sections.find((s) => s.path === "__proto__")).toBeUndefined();
    expect(sections.find((s) => s.path === "user")).toBeDefined();
  });
});

// ── Label overrides ──────────────────────────────────────────────────────────

describe("normalizeToSections — label overrides", () => {
  it("uses labels map for field labels", () => {
    const { sections } = normalizeToSections(
      { user: { dob: "1990-01-01" } },
      { labels: { dob: "Birthday" } }
    );
    const field = sections[0]?.fields[0];
    expect(field?.label).toBe("Birthday");
  });

  it("uses path-specific labels", () => {
    const { sections } = normalizeToSections(
      { user: { id: 1 }, product: { id: 2 } },
      { labels: { "user.id": "User ID", "product.id": "Product ID" } }
    );
    const userSection = sections.find((s) => s.path === "user");
    const productSection = sections.find((s) => s.path === "product");
    expect(userSection?.fields[0]?.label).toBe("User ID");
    expect(productSection?.fields[0]?.label).toBe("Product ID");
  });
});

// ── Nested / subsection handling ─────────────────────────────────────────────

describe("normalizeToSections — nested objects", () => {
  it("creates subsections for nested objects", () => {
    const { sections } = normalizeToSections({
      user: {
        name: "Alice",
        address: { city: "London", zip: "SW1A 1AA" },
      },
    });
    const userSection = sections[0];
    expect(userSection?.subsections).toHaveLength(1);
    expect(userSection?.subsections[0]?.title).toBe("Address");
  });

  it("subsection contains correct fields", () => {
    const { sections } = normalizeToSections({
      user: { address: { city: "London", zip: "SW1A 1AA" } },
    });
    const subFields = sections[0]?.subsections[0]?.fields ?? [];
    expect(subFields.find((f) => f.key === "city")?.value).toBe("London");
    expect(subFields.find((f) => f.key === "zip")?.value).toBe("SW1A 1AA");
  });

  it("handles array of objects as subsection list", () => {
    const { sections } = normalizeToSections({
      user: { orders: [{ id: 1, total: 100 }, { id: 2, total: 200 }] },
    });
    const ordersSubsection = sections[0]?.subsections.find(
      (s) => s.title === "Orders"
    );
    expect(ordersSubsection?.subsections).toHaveLength(2);
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { user: { name: "Alice" } };
    (obj["user"] as Record<string, unknown>)["self"] = obj["user"];
    expect(() => normalizeToSections(obj)).not.toThrow();
  });
});

// ── Top-level primitives and arrays ──────────────────────────────────────────

describe("normalizeToSections — top-level primitives", () => {
  it("wraps top-level primitive in a single-field section", () => {
    const { sections } = normalizeToSections({ status: "active" });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.fields[0]?.value).toBe("active");
  });

  it("wraps top-level primitive array in a single-field section", () => {
    const { sections } = normalizeToSections({ tags: ["a", "b"] });
    expect(sections[0]?.fields[0]?.type).toBe("array");
  });
});

// ── Array input ───────────────────────────────────────────────────────────────

describe("normalizeToSections — array input", () => {
  it("creates one section per array item", () => {
    const { sections } = normalizeToSections([
      { name: "Alice" },
      { name: "Bob" },
    ]);
    expect(sections).toHaveLength(2);
  });

  it("non-object array items are skipped", () => {
    const { sections } = normalizeToSections([
      { name: "Alice" },
      "string",
      42,
    ] as unknown[]);
    expect(sections).toHaveLength(1);
  });

  it("returns empty sections for empty array", () => {
    const { sections } = normalizeToSections([]);
    expect(sections).toHaveLength(0);
  });
});

// ── Descriptions ─────────────────────────────────────────────────────────────

describe("normalizeToSections — descriptions", () => {
  it("attaches description to field when provided", () => {
    const { sections } = normalizeToSections(
      { user: { dob: "1990-01-01" } },
      { descriptions: { dob: "Date of birth in ISO format" } }
    );
    const field = sections[0]?.fields[0];
    expect(field?.description).toBe("Date of birth in ISO format");
  });

  it("field description is undefined when not provided", () => {
    const { sections } = normalizeToSections({ user: { name: "Alice" } });
    const field = sections[0]?.fields[0];
    expect(field?.description).toBeUndefined();
  });
});

// ── Empty / edge cases ────────────────────────────────────────────────────────

describe("normalizeToSections — edge cases", () => {
  it("returns empty sections for null input", () => {
    const { sections } = normalizeToSections(null);
    expect(sections).toHaveLength(0);
  });

  it("returns empty sections for primitive input", () => {
    const { sections } = normalizeToSections(42);
    expect(sections).toHaveLength(0);
  });

  it("returns empty sections for empty object", () => {
    const { sections } = normalizeToSections({});
    expect(sections).toHaveLength(0);
  });
});

// ── flattenSectionsToFields ───────────────────────────────────────────────────

describe("flattenSectionsToFields", () => {
  it("flattens a single section to its fields", () => {
    const { sections } = normalizeToSections({ user: { name: "Alice", age: 30 } });
    const fields = flattenSectionsToFields(sections);
    expect(fields).toHaveLength(2);
  });

  it("flattens nested subsections into a single array (depth-first)", () => {
    const { sections } = normalizeToSections({
      user: { name: "Alice", address: { city: "London" } },
    });
    const fields = flattenSectionsToFields(sections);
    // "name" field + "city" field from subsection
    expect(fields.length).toBeGreaterThanOrEqual(2);
    expect(fields.map((f) => f.key)).toContain("name");
    expect(fields.map((f) => f.key)).toContain("city");
  });

  it("flattens multiple top-level sections", () => {
    const { sections } = normalizeToSections({
      user: { name: "Alice" },
      meta: { created: "2024-01-01" },
    });
    const fields = flattenSectionsToFields(sections);
    expect(fields.map((f) => f.key)).toContain("name");
    expect(fields.map((f) => f.key)).toContain("created");
  });

  it("returns empty array for empty sections", () => {
    const fields = flattenSectionsToFields([]);
    expect(fields).toHaveLength(0);
  });

  it("returns a frozen array", () => {
    const { sections } = normalizeToSections({ user: { name: "Alice" } });
    const fields = flattenSectionsToFields(sections);
    expect(Object.isFrozen(fields)).toBe(true);
  });

  it("preserves all field properties", () => {
    const { sections } = normalizeToSections({ user: { firstName: "Alice" } });
    const fields = flattenSectionsToFields(sections);
    const field = fields[0];
    expect(field).toMatchObject({
      label: "First Name",
      value: "Alice",
      path: "user.firstName",
      key: "firstName",
      type: "primitive",
    });
  });
});

// ── mergeSections ─────────────────────────────────────────────────────────────

describe("mergeSections", () => {
  it("merges two section arrays by title", () => {
    const { sections: a } = normalizeToSections({ user: { name: "Alice" } });
    const { sections: b } = normalizeToSections({ user: { age: 30 } });
    const merged = mergeSections(a, b);
    const userSection = merged.find((s) => s.title === "User");
    expect(userSection?.fields.map((f) => f.key)).toContain("name");
    expect(userSection?.fields.map((f) => f.key)).toContain("age");
  });

  it("keeps non-overlapping sections from both arrays", () => {
    const { sections: a } = normalizeToSections({ user: { name: "Alice" } });
    const { sections: b } = normalizeToSections({ meta: { id: 1 } });
    const merged = mergeSections(a, b);
    expect(merged.map((s) => s.title)).toContain("User");
    expect(merged.map((s) => s.title)).toContain("Meta");
  });

  it("handles merging two empty arrays", () => {
    expect(mergeSections([], [])).toHaveLength(0);
  });

  it("returns a frozen result", () => {
    const { sections: a } = normalizeToSections({ user: { name: "Alice" } });
    const merged = mergeSections(a, []);
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it("does not mutate input section arrays", () => {
    const { sections: a } = normalizeToSections({ user: { name: "Alice" } });
    const { sections: b } = normalizeToSections({ user: { age: 30 } });
    const lenBefore = a.length;
    mergeSections(a, b);
    expect(a.length).toBe(lenBefore);
  });
});

// ── Integration: full pipeline ────────────────────────────────────────────────

describe("normalizeToSections — integration with pipeline", () => {
  it("processes a realistic API payload", () => {
    const payload = {
      customer: {
        firstName: "Alice",
        lastName: "Smith",
        dob: "1990-01-01",
        email: "alice@example.com",
      },
      address: {
        line1: "123 Main St",
        city: "London",
        zipCode: "SW1A 1AA",
        country: "United Kingdom",
      },
      orders: [
        { orderId: "ORD-001", total: 1500 },
        { orderId: "ORD-002", total: 2200 },
      ],
    };

    const { sections, totalFields } = normalizeToSections(payload, {
      sectionMap: {
        customer: "Customer Details",
        address: "Shipping Address",
        orders: "Order History",
      },
      labels: { dob: "Date of Birth", zipCode: "ZIP Code" },
      excludeKeys: [],
    });

    expect(sections[0]?.title).toBe("Customer Details");
    expect(sections[1]?.title).toBe("Shipping Address");

    const customerFields = sections[0]?.fields ?? [];
    const dobField = customerFields.find((f) => f.key === "dob");
    expect(dobField?.label).toBe("Date of Birth");

    const addressFields = sections[1]?.fields ?? [];
    const zipField = addressFields.find((f) => f.key === "zipCode");
    expect(zipField?.label).toBe("ZIP Code");

    expect(totalFields).toBeGreaterThan(0);
  });
});
