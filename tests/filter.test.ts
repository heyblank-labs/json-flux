// =============================================================================
// tests/filter.test.ts
// Full test suite for v0.3.0 — Filtering & Visibility Layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { compileMatcher, compileMatchers, anyMatcherMatches } from "../src/filter/matcher.js";
import { excludeKeys, excludeKeysDirect } from "../src/filter/exclude.js";
import { includeKeys, includeKeysDirect } from "../src/filter/include.js";
import {
  hideIf, hideIfDirect,
  isNull, isNullish, isEmptyString, isEmptyArray, isEmptyObject, isFalsy,
} from "../src/filter/conditional.js";
import { stripEmpty, stripEmptyDirect } from "../src/filter/strip.js";
import {
  splitPath, joinPath, parentPath, leafKey,
  isValidPath, pathContainsUnsafeKey,
} from "../src/utils/path.js";

// =============================================================================
// Path utilities
// =============================================================================

describe("splitPath", () => {
  it("splits simple dot path", () => {
    expect(splitPath("user.address.city")).toEqual(["user", "address", "city"]);
  });
  it("splits array index notation", () => {
    expect(splitPath("users[0].name")).toEqual(["users", 0, "name"]);
  });
  it("splits nested array indices", () => {
    expect(splitPath("matrix[0][1]")).toEqual(["matrix", 0, 1]);
  });
  it("splits bracket string key", () => {
    expect(splitPath("data[key].value")).toEqual(["data", "key", "value"]);
  });
  it("returns empty for empty string", () => {
    expect(splitPath("")).toEqual([]);
  });
  it("handles single segment", () => {
    expect(splitPath("name")).toEqual(["name"]);
  });
});

describe("joinPath", () => {
  it("joins parent and key with dot", () => {
    expect(joinPath("user", "address")).toBe("user.address");
  });
  it("returns key alone when parent is empty", () => {
    expect(joinPath("", "user")).toBe("user");
  });
  it("handles numeric keys", () => {
    expect(joinPath("users", 0)).toBe("users.0");
  });
});

describe("parentPath", () => {
  it("returns parent path", () => {
    expect(parentPath("user.address.city")).toBe("user.address");
  });
  it("returns empty for top-level", () => {
    expect(parentPath("user")).toBe("");
  });
});

describe("leafKey", () => {
  it("returns last segment", () => {
    expect(leafKey("user.address.city")).toBe("city");
  });
  it("returns whole string for top-level", () => {
    expect(leafKey("user")).toBe("user");
  });
});

describe("isValidPath", () => {
  it("accepts simple path", () => expect(isValidPath("user.name")).toBe(true));
  it("accepts wildcard", () => expect(isValidPath("user.*.name")).toBe(true));
  it("accepts double-star glob", () => expect(isValidPath("**.password")).toBe(true));
  it("rejects empty string", () => expect(isValidPath("")).toBe(false));
  it("rejects __proto__", () => expect(isValidPath("__proto__")).toBe(false));
  it("rejects nested unsafe", () => expect(isValidPath("user.__proto__.x")).toBe(false));
});

describe("pathContainsUnsafeKey", () => {
  it("returns true for __proto__ in path", () => {
    expect(pathContainsUnsafeKey("user.__proto__.x")).toBe(true);
  });
  it("returns false for safe path", () => {
    expect(pathContainsUnsafeKey("user.address.city")).toBe(false);
  });
});

// =============================================================================
// Path Matcher
// =============================================================================

describe("compileMatcher — exact paths", () => {
  it("matches exact path", () => {
    const m = compileMatcher("user.name");
    expect(m.matches("user.name")).toBe(true);
    expect(m.matches("user.email")).toBe(false);
  });
  it("does not match partial prefix", () => {
    const m = compileMatcher("user.address");
    expect(m.matches("user")).toBe(false);
  });
  it("does not match child paths", () => {
    const m = compileMatcher("user");
    expect(m.matches("user.name")).toBe(false);
  });
});

describe("compileMatcher — single wildcard *", () => {
  it("matches one segment wildcard", () => {
    const m = compileMatcher("user.*.secret");
    expect(m.matches("user.address.secret")).toBe(true);
    expect(m.matches("user.profile.secret")).toBe(true);
    expect(m.matches("user.secret")).toBe(false);         // * needs exactly 1 segment
    expect(m.matches("user.a.b.secret")).toBe(false);     // * matches only 1
  });
  it("matches top-level wildcard", () => {
    const m = compileMatcher("*.password");
    expect(m.matches("user.password")).toBe(true);
    expect(m.matches("admin.password")).toBe(true);
    expect(m.matches("password")).toBe(false);
  });
});

describe("compileMatcher — double-star glob **", () => {
  it("matches zero segments", () => {
    const m = compileMatcher("**.password");
    expect(m.matches("password")).toBe(true);
  });
  it("matches one segment", () => {
    const m = compileMatcher("**.password");
    expect(m.matches("user.password")).toBe(true);
  });
  it("matches deeply nested", () => {
    const m = compileMatcher("**.password");
    expect(m.matches("a.b.c.d.password")).toBe(true);
  });
  it("does not match wrong leaf", () => {
    const m = compileMatcher("**.password");
    expect(m.matches("a.b.email")).toBe(false);
  });
  it("matches ** in middle", () => {
    const m = compileMatcher("user.**.id");
    expect(m.matches("user.profile.id")).toBe(true);
    expect(m.matches("user.id")).toBe(true);
    expect(m.matches("user.a.b.c.id")).toBe(true);
  });
});

describe("compileMatcher — array wildcard [*]", () => {
  it("matches any array index", () => {
    const m = compileMatcher("users[*].email");
    expect(m.matches("users.0.email")).toBe(true);
    expect(m.matches("users.99.email")).toBe(true);
    expect(m.matches("users.0.name")).toBe(false);
  });
});

describe("compileMatcher — case insensitive", () => {
  it("matches case-insensitively", () => {
    const m = compileMatcher("User.Name", { caseInsensitive: true });
    expect(m.matches("user.name")).toBe(true);
    expect(m.matches("USER.NAME")).toBe(true);
  });
});

describe("compileMatcher — safety", () => {
  it("throws on __proto__ pattern", () => {
    expect(() => compileMatcher("__proto__")).toThrow(/unsafe/i);
  });
  it("throws on constructor pattern", () => {
    expect(() => compileMatcher("user.constructor.x")).toThrow(/unsafe/i);
  });
});

describe("compileMatchers", () => {
  it("silently skips invalid patterns", () => {
    const matchers = compileMatchers(["user.name", "__proto__"]);
    expect(matchers).toHaveLength(1);
    expect(matchers[0]?.pattern).toBe("user.name");
  });
});

describe("anyMatcherMatches", () => {
  it("returns true if any matcher matches", () => {
    const matchers = compileMatchers(["user.name", "user.email"]);
    expect(anyMatcherMatches(matchers, "user.email")).toBe(true);
    expect(anyMatcherMatches(matchers, "user.phone")).toBe(false);
  });
});

// =============================================================================
// excludeKeys
// =============================================================================

describe("excludeKeys — basic", () => {
  it("excludes a single top-level key", () => {
    const { data } = excludeKeys({ a: 1, b: 2, c: 3 }, ["b"]);
    expect(data).toEqual({ a: 1, c: 3 });
  });

  it("excludes a nested key by bare name", () => {
    const { data } = excludeKeys(
      { user: { name: "Alice", password: "secret" } },
      ["password"]
    );
    expect((data as any).user.password).toBeUndefined();
    expect((data as any).user.name).toBe("Alice");
  });

  it("excludes by exact dot path", () => {
    const { data } = excludeKeys(
      { user: { address: { city: "London", zip: "SW1A 1AA" } } },
      ["user.address.zip"]
    );
    expect((data as any).user.address.city).toBe("London");
    expect((data as any).user.address.zip).toBeUndefined();
  });

  it("excludes multiple keys", () => {
    const { data } = excludeKeys({ a: 1, b: 2, c: 3, d: 4 }, ["b", "d"]);
    expect(data).toEqual({ a: 1, c: 3 });
  });

  it("returns removedCount and removedPaths", () => {
    const result = excludeKeys({ a: 1, b: 2, c: 3 }, ["b", "c"]);
    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain("b");
    expect(result.removedPaths).toContain("c");
  });

  it("does not mutate input", () => {
    const input = { user: { name: "Alice", password: "x" } };
    excludeKeys(input, ["password"]);
    expect((input as any).user.password).toBe("x");
  });
});

describe("excludeKeys — wildcard patterns", () => {
  it("excludes with single-wildcard pattern", () => {
    const input = { user: { token: "abc", profile: { token: "xyz", name: "Bob" } } };
    const { data } = excludeKeys(input, ["user.*.token"]);
    expect((data as any).user.profile.token).toBeUndefined();
    expect((data as any).user.token).toBe("abc"); // not matched — no middle segment
    expect((data as any).user.profile.name).toBe("Bob");
  });

  it("excludes with double-star glob across all depths", () => {
    const input = {
      user: { token: "a", profile: { token: "b", nested: { token: "c" } } },
    };
    const { data } = excludeKeys(input, ["**.token"]);
    expect((data as any).user.token).toBeUndefined();
    expect((data as any).user.profile.token).toBeUndefined();
    expect((data as any).user.profile.nested.token).toBeUndefined();
    expect((data as any).user.profile.name).toBeUndefined(); // never existed
  });

  it("excludes with array wildcard", () => {
    const input = {
      users: [
        { name: "Alice", ssn: "111" },
        { name: "Bob",   ssn: "222" },
      ],
    };
    const { data } = excludeKeys(input, ["users[*].ssn"]);
    expect((data as any).users[0].ssn).toBeUndefined();
    expect((data as any).users[1].ssn).toBeUndefined();
    expect((data as any).users[0].name).toBe("Alice");
  });
});

describe("excludeKeys — arrays", () => {
  it("processes objects inside arrays", () => {
    const input = [{ id: 1, secret: "x" }, { id: 2, secret: "y" }];
    const { data } = excludeKeys(input, ["secret"]);
    expect((data as any)[0].secret).toBeUndefined();
    expect((data as any)[1].secret).toBeUndefined();
    expect((data as any)[0].id).toBe(1);
  });
});

describe("excludeKeys — security", () => {
  it("silently ignores unsafe keys in object", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":1}') as Record<string, unknown>;
    const { data } = excludeKeys(malicious, ["safe"]);
    expect(Object.hasOwn({}, "x")).toBe(false);
    expect((data as any).safe).toBeUndefined();
  });
});

describe("excludeKeysDirect", () => {
  it("returns data directly without wrapper", () => {
    const result = excludeKeysDirect({ a: 1, b: 2 }, ["b"]);
    expect(result).toEqual({ a: 1 });
  });
});

// =============================================================================
// includeKeys
// =============================================================================

describe("includeKeys — basic", () => {
  it("keeps only listed top-level keys", () => {
    const { data } = includeKeys({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(data).toEqual({ a: 1, c: 3 });
  });

  it("keeps nested key by exact dot path", () => {
    const { data } = includeKeys(
      { user: { name: "Alice", password: "x", age: 30 } },
      ["user.name", "user.age"]
    );
    expect((data as any).user.name).toBe("Alice");
    expect((data as any).user.age).toBe(30);
    expect((data as any).user.password).toBeUndefined();
  });

  it("preserves ancestor structure for deep paths", () => {
    const { data } = includeKeys(
      { user: { address: { city: "London", zip: "SW1A 1AA" } }, meta: { id: 1 } },
      ["user.address.city"]
    );
    expect((data as any).user.address.city).toBe("London");
    expect((data as any).user.address.zip).toBeUndefined();
    expect((data as any).meta).toBeUndefined();
  });

  it("reports removedCount and removedPaths", () => {
    const result = includeKeys({ a: 1, b: 2, c: 3 }, ["a"]);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.removedPaths).toContain("b");
    expect(result.removedPaths).toContain("c");
  });

  it("does not mutate input", () => {
    const input = { a: 1, b: 2, c: 3 };
    includeKeys(input, ["a"]);
    expect(input).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("keeps entire subtree when path points to object", () => {
    const { data } = includeKeys(
      { user: { profile: { name: "Alice", bio: "Dev" }, secret: "x" } },
      ["user.profile"]
    );
    expect((data as any).user.profile.name).toBe("Alice");
    expect((data as any).user.profile.bio).toBe("Dev");
    expect((data as any).user.secret).toBeUndefined();
  });
});

describe("includeKeys — bare key names", () => {
  it("bare key matches at any depth", () => {
    const { data } = includeKeys(
      { a: { name: "x" }, b: { name: "y", secret: "z" } },
      ["name"]
    );
    expect((data as any).a.name).toBe("x");
    expect((data as any).b.name).toBe("y");
    expect((data as any).b.secret).toBeUndefined();
  });
});

describe("includeKeys — wildcard patterns", () => {
  it("includes with array wildcard", () => {
    const input = {
      users: [
        { id: 1, name: "Alice", token: "a" },
        { id: 2, name: "Bob",   token: "b" },
      ],
    };
    const { data } = includeKeys(input, ["users[*].id", "users[*].name"]);
    expect((data as any).users[0].id).toBe(1);
    expect((data as any).users[0].name).toBe("Alice");
    expect((data as any).users[0].token).toBeUndefined();
  });
});

describe("includeKeysDirect", () => {
  it("returns data directly", () => {
    const result = includeKeysDirect({ a: 1, b: 2, c: 3 }, ["a", "b"]);
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

// =============================================================================
// hideIf
// =============================================================================

describe("hideIf — basic predicate", () => {
  it("removes fields matching predicate", () => {
    const { data } = hideIf({ a: 1, b: null, c: "x" }, (v) => v === null);
    expect(data).toEqual({ a: 1, c: "x" });
  });

  it("removes based on key", () => {
    const { data } = hideIf(
      { name: "Alice", _internal: "x", role: "admin" },
      (_v, key) => key.startsWith("_")
    );
    expect((data as any)._internal).toBeUndefined();
    expect((data as any).name).toBe("Alice");
  });

  it("removes based on path", () => {
    const { data } = hideIf(
      { user: { name: "Alice" }, internal: { id: "x" } },
      (_v, _k, path) => path.startsWith("internal")
    );
    expect((data as any).internal).toBeUndefined();
    expect((data as any).user.name).toBe("Alice");
  });

  it("returns removedCount and removedPaths", () => {
    const result = hideIf({ a: null, b: 1, c: null }, (v) => v === null);
    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain("a");
    expect(result.removedPaths).toContain("c");
  });

  it("does not mutate input", () => {
    const input = { a: null, b: 1 };
    hideIf(input, (v) => v === null);
    expect(input.a).toBeNull();
  });
});

describe("hideIf — deep nested", () => {
  it("recurses into nested objects", () => {
    const { data } = hideIf(
      { user: { name: "Alice", age: null, address: { city: "London", zip: null } } },
      (v) => v === null
    );
    expect((data as any).user.age).toBeUndefined();
    expect((data as any).user.address.zip).toBeUndefined();
    expect((data as any).user.address.city).toBe("London");
  });

  it("removes array items matching predicate", () => {
    const { data } = hideIf({ tags: [null, "a", null, "b"] }, (v) => v === null);
    expect((data as any).tags).toEqual(["a", "b"]);
  });

  it("removes empty parent when removeEmptyParents = true (default)", () => {
    const input = { user: { secret: "x" }, other: { name: "Alice" } };
    const { data } = hideIf(input, (_v, key) => key === "secret");
    // user becomes {} after secret removed → should be removed as empty parent
    expect((data as any).user).toBeUndefined();
    expect((data as any).other.name).toBe("Alice");
  });

  it("keeps empty parent when removeEmptyParents = false", () => {
    const input = { user: { secret: "x" }, other: { name: "Alice" } };
    const { data } = hideIf(input, (_v, key) => key === "secret", { removeEmptyParents: false });
    expect((data as any).user).toEqual({});
  });
});

describe("hideIf — built-in predicates", () => {
  it("isNull removes only null", () => {
    const { data } = hideIf({ a: null, b: undefined, c: 1 }, isNull);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBeUndefined(); // undefined also removed as it's traversal gap
    expect((data as any).c).toBe(1);
  });

  it("isNullish removes null and undefined", () => {
    const input = { a: null, b: 1, c: "" };
    const { data } = hideIf(input, isNullish);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe(1);
  });

  it("isEmptyString removes empty strings", () => {
    const { data } = hideIf({ a: "", b: "hello", c: 0 }, isEmptyString);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe("hello");
    expect((data as any).c).toBe(0);
  });

  it("isEmptyArray removes empty arrays", () => {
    const { data } = hideIf({ a: [], b: [1, 2], c: "x" }, isEmptyArray);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toEqual([1, 2]);
  });

  it("isEmptyObject removes empty objects", () => {
    const { data } = hideIf({ a: {}, b: { x: 1 }, c: "y" }, isEmptyObject);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBeDefined();
  });

  it("isFalsy removes falsy values", () => {
    const { data } = hideIf({ a: null, b: 0, c: "", d: false, e: 1, f: "x" }, isFalsy);
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBeUndefined();
    expect((data as any).c).toBeUndefined();
    expect((data as any).d).toBeUndefined();
    expect((data as any).e).toBe(1);
    expect((data as any).f).toBe("x");
  });
});

describe("hideIfDirect", () => {
  it("returns data directly", () => {
    const result = hideIfDirect({ a: null, b: 1 }, (v) => v === null);
    expect(result).toEqual({ b: 1 });
  });
});

// =============================================================================
// stripEmpty
// =============================================================================

describe("stripEmpty — defaults", () => {
  it("removes null", () => {
    const { data } = stripEmpty({ a: null, b: 1 });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe(1);
  });

  it("removes empty string", () => {
    const { data } = stripEmpty({ a: "", b: "hello" });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe("hello");
  });

  it("removes empty arrays", () => {
    const { data } = stripEmpty({ a: [], b: [1, 2] });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toEqual([1, 2]);
  });

  it("removes empty objects", () => {
    const { data } = stripEmpty({ a: {}, b: { x: 1 } });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBeDefined();
  });

  it("preserves 0 by default", () => {
    const { data } = stripEmpty({ a: 0, b: 1 });
    expect((data as any).a).toBe(0);
  });

  it("preserves false by default", () => {
    const { data } = stripEmpty({ a: false, b: true });
    expect((data as any).a).toBe(false);
  });
});

describe("stripEmpty — options", () => {
  it("removes 0 when preserveZero = false", () => {
    const { data } = stripEmpty({ a: 0, b: 1 }, { preserveZero: false });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe(1);
  });

  it("removes false when preserveFalse = false", () => {
    const { data } = stripEmpty({ a: false, b: true }, { preserveFalse: false });
    expect((data as any).a).toBeUndefined();
    expect((data as any).b).toBe(true);
  });

  it("preserves empty string when preserveEmptyStrings = true", () => {
    const { data } = stripEmpty({ a: "", b: "x" }, { preserveEmptyStrings: true });
    expect((data as any).a).toBe("");
  });

  it("preserves empty arrays when preserveEmptyArrays = true", () => {
    const { data } = stripEmpty({ a: [], b: [1] }, { preserveEmptyArrays: true });
    expect((data as any).a).toEqual([]);
  });

  it("preserves empty objects when preserveEmptyObjects = true", () => {
    const { data } = stripEmpty({ a: {}, b: { x: 1 } }, { preserveEmptyObjects: true });
    expect((data as any).a).toEqual({});
  });
});

describe("stripEmpty — deep cleaning", () => {
  it("removes nested nulls recursively", () => {
    const { data } = stripEmpty({
      user: { name: "Alice", age: null, address: { city: "London", zip: null } },
    });
    expect((data as any).user.age).toBeUndefined();
    expect((data as any).user.address.zip).toBeUndefined();
    expect((data as any).user.address.city).toBe("London");
  });

  it("removes null items from arrays", () => {
    const { data } = stripEmpty({ tags: [null, "a", null, "b"] });
    expect((data as any).tags).toEqual(["a", "b"]);
  });

  it("removes objects that become empty after deep cleaning", () => {
    const { data } = stripEmpty({ user: { secret: null } });
    // user.secret removed → user becomes {} → user removed
    expect((data as any).user).toBeUndefined();
  });

  it("tracks removedCount and removedPaths", () => {
    const result = stripEmpty({ a: null, b: 1, c: "" });
    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain("a");
    expect(result.removedPaths).toContain("c");
  });

  it("does not mutate input", () => {
    const input = { a: null, b: 1 };
    stripEmpty(input);
    expect(input.a).toBeNull();
  });
});

describe("stripEmptyDirect", () => {
  it("returns data directly", () => {
    const result = stripEmptyDirect({ a: null, b: 1, c: "" });
    expect(result).toEqual({ b: 1 });
  });
});

// =============================================================================
// Combination scenarios
// =============================================================================

describe("filter combinations", () => {
  it("excludeKeys then hideIf", () => {
    const input = {
      user: { name: "Alice", password: "x", age: null },
      meta: { id: 1 },
    };
    const step1 = excludeKeysDirect(input, ["password"]);
    const step2 = hideIfDirect(step1, (v) => v === null);
    expect((step2 as any).user.password).toBeUndefined();
    expect((step2 as any).user.age).toBeUndefined();
    expect((step2 as any).user.name).toBe("Alice");
    expect((step2 as any).meta.id).toBe(1);
  });

  it("includeKeys then stripEmpty", () => {
    const input = {
      user: { name: "Alice", age: null, email: "a@b.com" },
      internal: { token: "abc" },
    };
    const step1 = includeKeysDirect(input, ["user.name", "user.age", "user.email"]);
    const step2 = stripEmptyDirect(step1);
    expect((step2 as any).user.name).toBe("Alice");
    expect((step2 as any).user.email).toBe("a@b.com");
    expect((step2 as any).user.age).toBeUndefined();
    expect((step2 as any).internal).toBeUndefined();
  });

  it("glob exclude + array filtering", () => {
    const input = {
      users: [
        { name: "Alice", password: "x", token: "a" },
        { name: "Bob",   password: "y", token: "b" },
      ],
    };
    const { data } = excludeKeys(input, ["**.password", "**.token"]);
    expect((data as any).users[0].password).toBeUndefined();
    expect((data as any).users[0].token).toBeUndefined();
    expect((data as any).users[0].name).toBe("Alice");
    expect((data as any).users[1].name).toBe("Bob");
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("filter — performance", () => {
  it("excludeKeys handles 1000-item array within 200ms", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i, name: `User${i}`, password: "secret", token: "abc",
    }));
    const start = performance.now();
    const { data } = excludeKeys({ users: items }, ["**.password", "**.token"]);
    const duration = performance.now() - start;
    expect((data as any).users[0].password).toBeUndefined();
    expect(duration).toBeLessThan(200);
  });

  it("stripEmpty handles 5000-key object within 100ms", () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) {
      obj[`k${i}`] = i % 3 === 0 ? null : i;
    }
    const start = performance.now();
    stripEmpty(obj);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });

  it("hideIf with 10k-node deep structure within 300ms", () => {
    const deep: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      deep[`field${i}`] = {
        value: i % 2 === 0 ? null : i,
        nested: { a: null, b: i },
      };
    }
    const start = performance.now();
    hideIf(deep, (v) => v === null);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(300);
  });
});
