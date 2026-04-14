// =============================================================================
// tests/humanize.test.ts
// Tests for humanize() and humanizeArray()
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { humanize, humanizeArray } from "../src/transform/humanize.js";
import { clearLabelCache } from "../src/transform/label.js";

beforeEach(() => clearLabelCache());

// ── Basic key transformation ─────────────────────────────────────────────────

describe("humanize — basic key transformation", () => {
  it("humanizes camelCase keys", () => {
    const result = humanize({ firstName: "Alice", lastName: "Smith" });
    expect(result["First Name"]).toBe("Alice");
    expect(result["Last Name"]).toBe("Smith");
  });

  it("humanizes snake_case keys", () => {
    const result = humanize({ user_id: 42, first_name: "Bob" });
    expect(result["User ID"]).toBe(42);
    expect(result["First Name"]).toBe("Bob");
  });

  it("humanizes kebab-case keys", () => {
    const result = humanize({ "first-name": "Carol" });
    expect(result["First Name"]).toBe("Carol");
  });

  it("uses built-in dictionary for known abbreviations", () => {
    const result = humanize({ dob: "1990-01-01", ssn: "***-**-1234" });
    expect(result["Date of Birth"]).toBe("1990-01-01");
    expect(result["SSN"]).toBe("***-**-1234");
  });

  it("preserves original values (numbers)", () => {
    const result = humanize({ age: 30 });
    expect(result["Age"]).toBe(30);
  });

  it("preserves original values (booleans)", () => {
    const result = humanize({ isActive: true });
    expect(result["Is Active"]).toBe(true);
  });

  it("preserves null values in output", () => {
    const result = humanize({ middleName: null });
    expect(result["Middle Name"]).toBeNull();
  });

  it("preserves array values", () => {
    const result = humanize({ tags: ["a", "b"] });
    expect(result["Tags"]).toEqual(["a", "b"]);
  });

  it("returns empty object for empty input", () => {
    const result = humanize({});
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ── Deep transformation ──────────────────────────────────────────────────────

describe("humanize — deep mode (default)", () => {
  it("recursively humanizes nested object keys", () => {
    const result = humanize({
      user: { firstName: "Alice", lastName: "Smith" },
    }) as Record<string, Record<string, unknown>>;

    expect(result["User"]).toBeDefined();
    expect(result["User"]?.["First Name"]).toBe("Alice");
    expect(result["User"]?.["Last Name"]).toBe("Smith");
  });

  it("recursively humanizes 3-level nesting", () => {
    const result = humanize({
      company: { department: { headCount: 12 } },
    }) as Record<string, Record<string, Record<string, unknown>>>;

    expect(result["Company"]?.["Department"]?.["Head Count"]).toBe(12);
  });

  it("humanizes keys inside array of objects", () => {
    const result = humanize({
      users: [{ firstName: "Alice" }, { firstName: "Bob" }],
    }) as Record<string, Array<Record<string, unknown>>>;

    expect(result["Users"]?.[0]?.["First Name"]).toBe("Alice");
    expect(result["Users"]?.[1]?.["First Name"]).toBe("Bob");
  });

  it("does NOT recurse when deep = false", () => {
    const result = humanize(
      { user: { firstName: "Alice" } },
      { deep: false }
    ) as Record<string, Record<string, unknown>>;

    expect(result["User"]).toBeDefined();
    // Inner keys should remain unchanged
    expect(result["User"]?.["firstName"]).toBe("Alice");
    expect(result["User"]?.["First Name"]).toBeUndefined();
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj["self"] = obj;
    expect(() => humanize(obj)).not.toThrow();
  });
});

// ── Label overrides ──────────────────────────────────────────────────────────

describe("humanize — label overrides", () => {
  it("uses explicit label overrides", () => {
    const result = humanize(
      { firstName: "Alice" },
      { labels: { firstName: "Given Name" } }
    );
    expect(result["Given Name"]).toBe("Alice");
  });

  it("label override is case-insensitive", () => {
    const result = humanize(
      { FIRSTNAME: "Alice" },
      { labels: { firstname: "Given Name" } }
    );
    expect(result["Given Name"]).toBe("Alice");
  });

  it("falls back to auto-label when key not in overrides", () => {
    const result = humanize(
      { firstName: "Alice", lastName: "Smith" },
      { labels: { firstName: "Given Name" } }
    );
    expect(result["Given Name"]).toBe("Alice");
    expect(result["Last Name"]).toBe("Smith");
  });
});

// ── Flatten mode ─────────────────────────────────────────────────────────────

describe("humanize — flatten mode", () => {
  it("flattens nested object to one level with humanized paths", () => {
    const result = humanize(
      { user: { firstName: "Alice", age: 30 } },
      { flatten: true }
    );
    expect(result["User First Name"]).toBe("Alice");
    expect(result["User Age"]).toBe(30);
  });

  it("flattens deeply nested structures", () => {
    const result = humanize(
      { company: { address: { city: "Chennai" } } },
      { flatten: true }
    );
    expect(result["Company Address City"]).toBe("Chennai");
  });

  it("handles primitive arrays in flatten mode", () => {
    const result = humanize(
      { user: { tags: ["a", "b"] } },
      { flatten: true }
    );
    // Arrays of primitives are joined in flatten
    expect(result["User Tags"]).toBeDefined();
  });
});

// ── Immutability ─────────────────────────────────────────────────────────────

describe("humanize — immutability", () => {
  it("does not mutate the input object", () => {
    const input = { firstName: "Alice", user: { age: 30 } };
    humanize(input);
    expect(input.firstName).toBe("Alice");
    expect(Object.keys(input)).toContain("firstName");
    expect(Object.keys(input)).not.toContain("First Name");
  });
});

// ── Security ─────────────────────────────────────────────────────────────────

describe("humanize — security", () => {
  it("drops __proto__ keys silently", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"name":"Alice"}') as Record<string, unknown>;
    const result = humanize(malicious);
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(Object.hasOwn({}, "x")).toBe(false);
    expect(result["Name"]).toBe("Alice");
  });

  it("drops constructor keys silently", () => {
    const malicious = JSON.parse('{"constructor":{"polluted":true},"ok":1}') as Record<string, unknown>;
    const result = humanize(malicious);
    expect(result["Constructor"]).toBeUndefined();
    expect(result["Ok"]).toBe(1);
  });
});

// ── humanizeArray ────────────────────────────────────────────────────────────

describe("humanizeArray", () => {
  it("humanizes keys in each array item", () => {
    const result = humanizeArray([
      { firstName: "Alice" },
      { firstName: "Bob" },
    ]);
    expect(result[0]?.["First Name"]).toBe("Alice");
    expect(result[1]?.["First Name"]).toBe("Bob");
  });

  it("returns empty array for empty input", () => {
    expect(humanizeArray([])).toHaveLength(0);
  });

  it("applies shared options to all items", () => {
    const result = humanizeArray(
      [{ firstName: "Alice" }],
      { labels: { firstName: "Given Name" } }
    );
    expect(result[0]?.["Given Name"]).toBe("Alice");
  });

  it("does not mutate input items", () => {
    const items = [{ firstName: "Alice" }];
    humanizeArray(items);
    expect(items[0]?.firstName).toBe("Alice");
  });
});
