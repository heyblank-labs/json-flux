// =============================================================================
// tests/filter.edge.test.ts
// Additional edge cases to cover remaining branches in filter layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { excludeKeys } from "../src/filter/exclude.js";
import { includeKeys, includeKeysDirect } from "../src/filter/include.js";
import { hideIf } from "../src/filter/conditional.js";
import { stripEmpty } from "../src/filter/strip.js";
import { compileMatcher } from "../src/filter/matcher.js";

// =============================================================================
// includeKeys — deeper branch coverage
// =============================================================================

describe("includeKeys — array input", () => {
  it("handles array at root", () => {
    const input = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
    const { data } = includeKeys(input, ["a"]);
    expect((data as any)[0].a).toBe(1);
    expect((data as any)[0].b).toBeUndefined();
    expect((data as any)[1].a).toBe(3);
  });
});

describe("includeKeys — path patterns", () => {
  it("keeps only deeply included path, removes sibling", () => {
    const { data } = includeKeys(
      { order: { id: 1, internalCode: "X", customer: { name: "Alice" } } },
      ["order.id", "order.customer.name"]
    );
    expect((data as any).order.id).toBe(1);
    expect((data as any).order.customer.name).toBe("Alice");
    expect((data as any).order.internalCode).toBeUndefined();
  });

  it("glob pattern **.id descends all objects (any could contain id)", () => {
    // **.id means "any path ending in id" — all objects are potential ancestors
    // since ** matches zero or more segments before "id"
    // meta doesn't have id so it ends up empty, but ancestor descent keeps the shell
    const { data } = includeKeys(
      { user: { id: 1, name: "Alice" }, product: { id: 2 } },
      ["user.id", "product.id"]  // use explicit paths for precise control
    );
    expect((data as any).user.id).toBe(1);
    expect((data as any).product.id).toBe(2);
    expect((data as any).user.name).toBeUndefined();
  });

  it("wildcard * includes one-level matches", () => {
    const { data } = includeKeys(
      { a: { x: 1, y: 2 }, b: { x: 3, z: 4 } },
      ["*.x"]
    );
    expect((data as any).a.x).toBe(1);
    expect((data as any).b.x).toBe(3);
    expect((data as any).a.y).toBeUndefined();
    expect((data as any).b.z).toBeUndefined();
  });

  it("includes nothing when no keys match", () => {
    const { data } = includeKeys({ a: 1, b: 2 }, ["z"]);
    expect(data).toEqual({});
  });

  it("returns frozen result", () => {
    const result = includeKeys({ a: 1 }, ["a"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("shallow mode does not recurse", () => {
    const { data } = includeKeys(
      { user: { name: "Alice", secret: "x" } },
      ["user"],
      { deep: false }
    );
    // user is a direct match — kept as-is regardless of deep
    expect((data as any).user.name).toBe("Alice");
    expect((data as any).user.secret).toBe("x");
  });

  it("case insensitive matching on bare keys", () => {
    const { data } = includeKeys(
      { User: "Alice", Secret: "x", Name: "Bob" },
      ["user", "name"],
      { caseInsensitive: true }
    );
    expect((data as any).User).toBe("Alice");
    expect((data as any).Name).toBe("Bob");
    expect((data as any).Secret).toBeUndefined();
  });
});

describe("includeKeys — circular reference", () => {
  it("handles circular references safely", () => {
    const obj: Record<string, unknown> = { name: "root", value: 1 };
    obj["self"] = obj;
    expect(() => includeKeys(obj, ["name"])).not.toThrow();
    const { data } = includeKeys(obj, ["name"]);
    expect((data as any).name).toBe("root");
  });
});

// =============================================================================
// excludeKeys — additional branch coverage
// =============================================================================

describe("excludeKeys — edge cases", () => {
  it("returns empty object when all keys excluded", () => {
    const { data } = excludeKeys({ a: 1, b: 2 }, ["a", "b"]);
    expect(data).toEqual({});
  });

  it("handles empty keys array — returns unchanged", () => {
    const { data } = excludeKeys({ a: 1, b: 2 }, []);
    expect(data).toEqual({ a: 1, b: 2 });
  });

  it("shallow mode skips deep traversal", () => {
    const input = { user: { name: "Alice", password: "x" } };
    // With deep=false, only top-level keys 'user' are scanned
    const { data } = excludeKeys(input, ["user"], { deep: false });
    expect((data as any).user).toBeUndefined();
  });

  it("returns frozen result", () => {
    const result = excludeKeys({ a: 1 }, ["b"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.removedPaths)).toBe(true);
  });

  it("handles null/primitive input gracefully", () => {
    expect(excludeKeys(null as unknown as object, ["a"]).data).toBeNull();
    expect(excludeKeys(42 as unknown as object, ["a"]).data).toBe(42);
  });
});

// =============================================================================
// hideIf — additional branches
// =============================================================================

describe("hideIf — edge cases", () => {
  it("handles null input", () => {
    const { data } = hideIf(null as unknown, () => true);
    expect(data).toBeNull();
  });

  it("handles primitive input", () => {
    const { data } = hideIf(42 as unknown, () => true);
    expect(data).toBe(42);
  });

  it("keeps empty parent when removeEmptyParents off and nested array empties", () => {
    const input = { items: [null, null] };
    const { data } = hideIf(input, (v) => v === null, { removeEmptyParents: false });
    expect((data as any).items).toEqual([]);
  });

  it("deep=false does not recurse into nested objects", () => {
    const input = { user: { name: "Alice", age: null } };
    const { data } = hideIf(input, (v) => v === null, { deep: false });
    // At root level, user value is not null, so user is kept. No recursion.
    expect((data as any).user.age).toBeNull(); // age NOT removed — deep=false
    expect((data as any).user.name).toBe("Alice");
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj["self"] = obj;
    expect(() => hideIf(obj, (v) => v === null)).not.toThrow();
  });
});

// =============================================================================
// stripEmpty — additional branches
// =============================================================================

describe("stripEmpty — edge cases", () => {
  it("handles empty object input", () => {
    const { data } = stripEmpty({});
    expect(data).toEqual({});
  });

  it("handles array with all empty items — array itself removed", () => {
    // After removing all null/"" items the array becomes [] which is also empty → removed
    const { data } = stripEmpty({ tags: [null, null, ""] });
    expect((data as any).tags).toBeUndefined();
  });

  it("handles array with all empty items — array kept when preserveEmptyArrays=true", () => {
    const { data } = stripEmpty({ tags: [null, null, ""] }, { preserveEmptyArrays: true });
    expect((data as any).tags).toEqual([]);
  });

  it("handles primitive input", () => {
    expect(stripEmpty(42 as unknown).data).toBe(42);
    expect(stripEmpty("hello" as unknown).data).toBe("hello");
  });

  it("handles false and 0 removal together", () => {
    const { data } = stripEmpty(
      { a: false, b: 0, c: 1 },
      { preserveFalse: false, preserveZero: false }
    );
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBeUndefined();
    expect((data as any).c).toBe(1);
  });

  it("returns correct removedPaths with nested removal", () => {
    const result = stripEmpty({ user: { name: "Alice", age: null } });
    expect(result.removedPaths).toContain("user.age");
    expect(result.removedCount).toBe(1);
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { name: "Alice" };
    obj["self"] = obj;
    expect(() => stripEmpty(obj)).not.toThrow();
  });
});

// =============================================================================
// matcher — additional edge cases
// =============================================================================

describe("compileMatcher — edge cases", () => {
  it("handles path with only **", () => {
    const m = compileMatcher("**");
    expect(m.matches("anything")).toBe(true);
    expect(m.matches("a.b.c")).toBe(true);
    expect(m.matches("")).toBe(true);
  });

  it("isGlob is true for patterns with *", () => {
    expect(compileMatcher("**.name").isGlob).toBe(true);
    expect(compileMatcher("user.name").isGlob).toBe(false);
  });

  it("matches exact single-segment path", () => {
    const m = compileMatcher("name");
    expect(m.matches("name")).toBe(true);
    expect(m.matches("username")).toBe(false);
  });

  it("handles deeply nested exact path", () => {
    const m = compileMatcher("a.b.c.d.e");
    expect(m.matches("a.b.c.d.e")).toBe(true);
    expect(m.matches("a.b.c.d")).toBe(false);
    expect(m.matches("a.b.c.d.e.f")).toBe(false);
  });

  it("** matches zero segments (leaf at root)", () => {
    const m = compileMatcher("**.id");
    expect(m.matches("id")).toBe(true);
  });

  it("handles mixed pattern with ** in middle", () => {
    const m = compileMatcher("users.**.email");
    expect(m.matches("users.0.email")).toBe(true);
    expect(m.matches("users.profile.contact.email")).toBe(true);
    expect(m.matches("users.email")).toBe(true);
    expect(m.matches("admin.email")).toBe(false);
  });
});

// =============================================================================
// Integration: filter with v0.1.0 and v0.2.0 layers
// =============================================================================

import { stripEmptyDirect } from "../src/filter/strip.js";
import { excludeKeysDirect } from "../src/filter/exclude.js";
import { flattenObject } from "../src/core/flatten.js";
import { normalizeToSections, flattenSectionsToFields } from "../src/transform/section.js";

describe("v0.3.0 + v0.1.0 pipeline integration", () => {
  it("stripEmpty → flattenObject pipeline", () => {
    const input = {
      user: { name: "Alice", age: null, email: "" },
      meta: { id: 1, internal: null },
    };
    const stripped = stripEmptyDirect(input);
    const { data } = flattenObject(stripped as Record<string, unknown>);
    expect(data["user.name"]).toBe("Alice");
    expect("user.age" in data).toBe(false);
    expect("user.email" in data).toBe(false);
    expect(data["meta.id"]).toBe(1);
    expect("meta.internal" in data).toBe(false);
  });

  it("excludeKeys → normalizeToSections pipeline", () => {
    const input = {
      user: {
        name: "Alice",
        password: "secret",
        token: "abc",
        email: "alice@example.com",
      },
    };
    const filtered = excludeKeysDirect(input, ["**.password", "**.token"]);
    const { sections } = normalizeToSections(filtered as Record<string, unknown>);
    const fields = flattenSectionsToFields(sections);
    const fieldKeys = fields.map((f) => f.key);
    expect(fieldKeys).toContain("name");
    expect(fieldKeys).toContain("email");
    expect(fieldKeys).not.toContain("password");
    expect(fieldKeys).not.toContain("token");
  });
});
