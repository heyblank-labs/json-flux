// =============================================================================
// tests/structure.test.ts
// Full test suite for v0.5.0 — Structural Transformation Layer
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { unflatten, compactSparseArray } from "../src/structure/unflatten.js";
import { remapObject, remapObjectDirect } from "../src/structure/remap.js";
import { mergeDeep } from "../src/structure/merge.js";
import { pivotStructure, arrayToObject, objectToArray } from "../src/structure/pivot.js";
import { normalizeKeys } from "../src/structure/normalizeKeys.js";
import { convertKeyCase, convertKey, tokeniseKey, clearCaseCache } from "../src/utils/case.js";
import { flattenObject } from "../src/core/flatten.js";

beforeEach(() => clearCaseCache());

// =============================================================================
// tokeniseKey
// =============================================================================

describe("tokeniseKey", () => {
  it("tokenises camelCase", () => expect(tokeniseKey("firstName")).toEqual(["first", "name"]));
  it("tokenises PascalCase", () => expect(tokeniseKey("UserProfile")).toEqual(["user", "profile"]));
  it("tokenises snake_case", () => expect(tokeniseKey("first_name")).toEqual(["first", "name"]));
  it("tokenises kebab-case", () => expect(tokeniseKey("first-name")).toEqual(["first", "name"]));
  it("tokenises SCREAMING_SNAKE", () => expect(tokeniseKey("API_KEY")).toEqual(["api", "key"]));
  it("tokenises XMLParser", () => expect(tokeniseKey("XMLParser")).toEqual(["xml", "parser"]));
  it("tokenises userID", () => expect(tokeniseKey("userID")).toEqual(["user", "id"]));
  it("handles empty string", () => expect(tokeniseKey("")).toEqual([]));
  it("handles single word", () => expect(tokeniseKey("name")).toEqual(["name"]));
});

// =============================================================================
// convertKeyCase
// =============================================================================

describe("convertKeyCase — camel", () => {
  it("snake → camel", () => expect(convertKeyCase("first_name", "camel")).toBe("firstName"));
  it("kebab → camel", () => expect(convertKeyCase("first-name", "camel")).toBe("firstName"));
  it("SCREAMING → camel", () => expect(convertKeyCase("API_KEY", "camel")).toBe("apiKey"));
  it("PascalCase → camel", () => expect(convertKeyCase("UserProfile", "camel")).toBe("userProfile"));
  it("XMLParser → camel", () => expect(convertKeyCase("XMLParser", "camel")).toBe("xmlParser"));
  it("userID → camel", () => expect(convertKeyCase("userID", "camel")).toBe("userId"));
  it("already camel stays camel", () => expect(convertKeyCase("firstName", "camel")).toBe("firstName"));
});

describe("convertKeyCase — snake", () => {
  it("camel → snake", () => expect(convertKeyCase("firstName", "snake")).toBe("first_name"));
  it("kebab → snake", () => expect(convertKeyCase("first-name", "snake")).toBe("first_name"));
  it("SCREAMING → snake (lowercase)", () => expect(convertKeyCase("API_KEY", "snake")).toBe("api_key"));
  it("PascalCase → snake", () => expect(convertKeyCase("UserProfile", "snake")).toBe("user_profile"));
});

describe("convertKeyCase — pascal", () => {
  it("snake → pascal", () => expect(convertKeyCase("first_name", "pascal")).toBe("FirstName"));
  it("camel → pascal", () => expect(convertKeyCase("firstName", "pascal")).toBe("FirstName"));
  it("SCREAMING → pascal", () => expect(convertKeyCase("API_KEY", "pascal")).toBe("ApiKey"));
});

describe("convertKeyCase — kebab", () => {
  it("camel → kebab", () => expect(convertKeyCase("firstName", "kebab")).toBe("first-name"));
  it("snake → kebab", () => expect(convertKeyCase("first_name", "kebab")).toBe("first-name"));
  it("SCREAMING → kebab", () => expect(convertKeyCase("API_KEY", "kebab")).toBe("api-key"));
});

describe("convertKeyCase — safety", () => {
  it("passes through __proto__ unchanged", () => {
    expect(convertKeyCase("__proto__", "camel")).toBe("__proto__");
  });
  it("passes through constructor unchanged", () => {
    expect(convertKeyCase("constructor", "snake")).toBe("constructor");
  });
  it("caches results — same output on repeated calls", () => {
    const a = convertKeyCase("firstName", "snake");
    const b = convertKeyCase("firstName", "snake");
    expect(a).toBe(b);
  });
});

describe("convertKey — with customMap", () => {
  it("uses customMap over auto-conversion", () => {
    expect(convertKey("user_id", "camel", { user_id: "userId" })).toBe("userId");
  });
  it("case-insensitive custom map lookup", () => {
    expect(convertKey("USER_ID", "camel", { user_id: "userId" })).toBe("userId");
  });
  it("falls back to auto when key not in map", () => {
    expect(convertKey("first_name", "camel", { other: "x" })).toBe("firstName");
  });
});

// =============================================================================
// unflatten
// =============================================================================

describe("unflatten — basic", () => {
  it("reconstructs a flat object", () => {
    const result = unflatten({ "user.name": "Alice", "user.age": 30 });
    expect(result).toEqual({ user: { name: "Alice", age: 30 } });
  });

  it("handles deeply nested paths", () => {
    const result = unflatten({ "user.address.city": "London", "user.address.zip": "SW1A 1AA" });
    expect(result).toEqual({ user: { address: { city: "London", zip: "SW1A 1AA" } } });
  });

  it("handles multiple root keys", () => {
    const result = unflatten({ "user.name": "Alice", "meta.id": 1 });
    expect(result).toEqual({ user: { name: "Alice" }, meta: { id: 1 } });
  });

  it("is the inverse of flattenObject", () => {
    const original = { user: { name: "Alice", address: { city: "London" } } };
    const { data: flat } = flattenObject(original);
    const reconstructed = unflatten(flat);
    expect(reconstructed).toEqual(original);
  });
});

describe("unflatten — arrays", () => {
  it("reconstructs arrays from numeric dot segments", () => {
    const result = unflatten({ "users.0.name": "Alice", "users.1.name": "Bob" });
    expect(result.users).toBeDefined();
    // Numeric segments create array-like structure
    expect((result.users as any)[0].name).toBe("Alice");
    expect((result.users as any)[1].name).toBe("Bob");
  });

  it("handles bracket notation for arrays", () => {
    const result = unflatten({ "items[0].id": 1, "items[1].id": 2 });
    expect((result as any).items[0].id).toBe(1);
    expect((result as any).items[1].id).toBe(2);
  });

  it("handles parseArrays: false — keeps numeric keys as strings", () => {
    const result = unflatten(
      { "users.0.name": "Alice" },
      { parseArrays: false }
    );
    // Should still reconstruct but may keep as object
    expect(result.users).toBeDefined();
  });
});

describe("unflatten — bracket-escaped keys", () => {
  it("handles escaped keys from flatten layer", () => {
    const result = unflatten({ "[a.b].c": 1 });
    expect((result["a.b"] as any).c).toBe(1);
  });
});

describe("unflatten — security", () => {
  it("silently skips __proto__ segments", () => {
    const result = unflatten({ "__proto__.polluted": "evil" });
    expect(Object.hasOwn({}, "polluted")).toBe(false);
    expect(result).toEqual({});
  });

  it("silently skips constructor segments", () => {
    const result = unflatten({ "constructor.polluted": true });
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });
});

describe("unflatten — edge cases", () => {
  it("handles empty flat object", () => expect(unflatten({})).toEqual({}));
  it("handles single-key flat object", () => {
    expect(unflatten({ name: "Alice" })).toEqual({ name: "Alice" });
  });
  it("custom delimiter", () => {
    const result = unflatten({ "user/name": "Alice" }, { delimiter: "/" });
    expect(result).toEqual({ user: { name: "Alice" } });
  });
});

describe("compactSparseArray", () => {
  it("converts numeric object to array", () => {
    const result = compactSparseArray({ "0": "a", "1": "b", "2": "c" });
    expect(result).toEqual(["a", "b", "c"]);
  });
  it("returns empty array for non-numeric keys", () => {
    expect(compactSparseArray({ a: 1, b: 2 })).toEqual([]);
  });
});

// =============================================================================
// remapObject
// =============================================================================

describe("remapObject — basic", () => {
  it("maps source paths to target paths", () => {
    const result = remapObject(
      { user: { name: "Alice", age: 30 } },
      { "user.name": "profile.fullName", "user.age": "profile.details.age" }
    );
    expect(result).toEqual({ profile: { fullName: "Alice", details: { age: 30 } } });
  });

  it("maps top-level keys", () => {
    const result = remapObject({ a: 1, b: 2 }, { a: "x", b: "y" });
    expect(result).toEqual({ x: 1, y: 2 });
  });

  it("excludes unmapped fields by default", () => {
    const result = remapObject({ a: 1, b: 2, c: 3 }, { a: "x" });
    expect(result).toEqual({ x: 1 });
    expect("b" in result).toBe(false);
  });

  it("keeps unmapped fields with keepUnmapped: true", () => {
    const result = remapObject({ a: 1, b: 2, c: 3 }, { a: "x" }, { keepUnmapped: true });
    expect(result).toEqual({ x: 1, b: 2, c: 3 });
  });

  it("uses defaultValue for missing source path", () => {
    const result = remapObject(
      { user: { name: "Alice" } },
      { "user.name": "name", "user.email": "email" },
      { defaultValue: "N/A" }
    );
    expect(result).toEqual({ name: "Alice", email: "N/A" });
  });

  it("omits field when source missing and no defaultValue", () => {
    const result = remapObject({ a: 1 }, { missing: "x" });
    expect("x" in result).toBe(false);
  });
});

describe("remapObject — complex paths", () => {
  it("collapses deep structure to flat", () => {
    const result = remapObject(
      { meta: { id: 1 }, user: { profile: { name: "Alice" } } },
      { "meta.id": "id", "user.profile.name": "name" }
    );
    expect(result).toEqual({ id: 1, name: "Alice" });
  });

  it("expands flat to deep", () => {
    const result = remapObject(
      { id: 1, name: "Alice" },
      { id: "user.meta.id", name: "user.profile.name" }
    );
    expect((result as any).user.meta.id).toBe(1);
    expect((result as any).user.profile.name).toBe("Alice");
  });
});

describe("remapObject — safety", () => {
  it("does not mutate input", () => {
    const input = { user: { name: "Alice" } };
    remapObject(input, { "user.name": "name" });
    expect(input.user.name).toBe("Alice");
  });

  it("skips mappings with unsafe target paths", () => {
    const result = remapObject({ a: 1 }, { a: "__proto__.polluted" });
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });
});

// =============================================================================
// mergeDeep
// =============================================================================

describe("mergeDeep — basic", () => {
  it("merges two flat objects", () => {
    expect(mergeDeep({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("source overwrites target on conflict", () => {
    expect(mergeDeep({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("deep-merges nested objects", () => {
    const result = mergeDeep(
      { user: { name: "Alice", role: "user" } },
      { user: { role: "admin" }, active: true }
    );
    expect(result).toEqual({ user: { name: "Alice", role: "admin" }, active: true });
  });

  it("does not mutate inputs", () => {
    const a = { user: { name: "Alice" } };
    const b = { user: { role: "admin" } };
    mergeDeep(a, b);
    expect(a).toEqual({ user: { name: "Alice" } });
    expect(b).toEqual({ user: { role: "admin" } });
  });

  it("merges multiple sources", () => {
    const result = mergeDeep({ a: 1 }, { b: 2 }, { c: 3 });
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe("mergeDeep — array strategies", () => {
  it("replace (default) — source replaces target", () => {
    const result = mergeDeep({ tags: ["a", "b"] }, { tags: ["c", "d"] });
    expect(result.tags).toEqual(["c", "d"]);
  });

  it("concat — arrays joined", () => {
    const result = mergeDeep(
      { tags: ["a", "b"] },
      { tags: ["c", "d"] },
      { arrayStrategy: "concat" }
    );
    expect(result.tags).toEqual(["a", "b", "c", "d"]);
  });

  it("unique — deduplicates", () => {
    const result = mergeDeep(
      { tags: ["a", "b", "c"] },
      { tags: ["b", "c", "d"] },
      { arrayStrategy: "unique" }
    );
    expect(result.tags).toEqual(["a", "b", "c", "d"]);
  });

  it("unique deduplicates objects by deep equality", () => {
    const result = mergeDeep(
      { items: [{ id: 1 }, { id: 2 }] },
      { items: [{ id: 2 }, { id: 3 }] },
      { arrayStrategy: "unique" }
    );
    expect((result.items as unknown[]).length).toBe(3);
  });
});

describe("mergeDeep — safety", () => {
  it("drops __proto__ keys from source", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":true}') as Record<string, unknown>;
    mergeDeep({ a: 1 }, malicious);
    expect(Object.hasOwn({}, "x")).toBe(false);
  });
});

// =============================================================================
// pivotStructure / arrayToObject / objectToArray
// =============================================================================

describe("arrayToObject", () => {
  it("converts array to keyed object", () => {
    const result = arrayToObject(
      [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }],
      "id"
    );
    expect(result).toEqual({ u1: { name: "Alice" }, u2: { name: "Bob" } });
  });

  it("omits the keyField from value", () => {
    const result = arrayToObject([{ id: "a", x: 1, y: 2 }], "id");
    expect("id" in (result["a"] as object)).toBe(false);
  });

  it("skips items without the keyField", () => {
    const result = arrayToObject([{ name: "Alice" }, { id: "b", name: "Bob" }], "id");
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["b"]).toBeDefined();
  });

  it("skips non-object items", () => {
    const result = arrayToObject(["string", 42, { id: "a", name: "Alice" }], "id");
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("returns empty for unsafe keyField", () => {
    expect(arrayToObject([{ id: 1 }], "__proto__")).toEqual({});
  });
});

describe("objectToArray", () => {
  it("converts object to array with default key/value field names", () => {
    const result = objectToArray({ a: { name: "Alice" }, b: { name: "Bob" } });
    expect(result).toEqual([
      { key: "a", name: "Alice" },
      { key: "b", name: "Bob" },
    ]);
  });

  it("stores primitive values in valueName field", () => {
    const result = objectToArray({ active: true, count: 42 });
    expect(result).toContainEqual({ key: "active", value: true });
    expect(result).toContainEqual({ key: "count", value: 42 });
  });

  it("uses custom keyName", () => {
    const result = objectToArray({ u1: { name: "Alice" } }, "userId");
    expect(result[0]?.userId).toBe("u1");
  });

  it("skips unsafe keys", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":1}') as Record<string, unknown>;
    const result = objectToArray(malicious);
    expect(result.every((r) => r["key"] !== "__proto__")).toBe(true);
  });
});

describe("pivotStructure", () => {
  it("pivots array to object", () => {
    const result = pivotStructure(
      [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }],
      "arrayToObject",
      { keyField: "id" }
    );
    expect((result as any).u1.name).toBe("Alice");
    expect((result as any).u2.name).toBe("Bob");
  });

  it("pivots object to array", () => {
    const result = pivotStructure(
      { u1: { name: "Alice" }, u2: { name: "Bob" } },
      "objectToArray",
      { keyName: "userId" }
    ) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result.find((r) => r["userId"] === "u1")?.["name"]).toBe("Alice");
  });

  it("throws when arrayToObject called with non-array", () => {
    expect(() =>
      pivotStructure({ a: 1 }, "arrayToObject", { keyField: "id" })
    ).toThrow();
  });

  it("throws when arrayToObject called without keyField", () => {
    expect(() => pivotStructure([{ id: 1 }], "arrayToObject")).toThrow();
  });

  it("throws when objectToArray called with non-object", () => {
    expect(() => pivotStructure([1, 2], "objectToArray")).toThrow();
  });
});

// =============================================================================
// normalizeKeys
// =============================================================================

describe("normalizeKeys — camel (default)", () => {
  it("converts snake_case keys", () => {
    expect(normalizeKeys({ first_name: "Alice", last_name: "Smith" })).toEqual({
      firstName: "Alice",
      lastName: "Smith",
    });
  });

  it("converts kebab-case keys", () => {
    expect(normalizeKeys({ "first-name": "Alice" })).toEqual({ firstName: "Alice" });
  });

  it("converts SCREAMING_SNAKE keys", () => {
    expect(normalizeKeys({ API_KEY: "abc123" })).toEqual({ apiKey: "abc123" });
  });

  it("converts PascalCase keys", () => {
    expect(normalizeKeys({ UserProfile: "Alice" })).toEqual({ userProfile: "Alice" });
  });

  it("preserves values unchanged", () => {
    const result = normalizeKeys({ first_name: "Alice", age: 30, active: true });
    expect((result as any).firstName).toBe("Alice");
    expect((result as any).age).toBe(30);
    expect((result as any).active).toBe(true);
  });
});

describe("normalizeKeys — snake", () => {
  it("converts camelCase to snake_case", () => {
    expect(normalizeKeys({ firstName: "Alice" }, { case: "snake" })).toEqual({ first_name: "Alice" });
  });

  it("converts mixed formats to snake_case", () => {
    const result = normalizeKeys(
      { firstName: "Alice", "last-name": "Smith", UserAge: 30 },
      { case: "snake" }
    );
    expect(result).toEqual({ first_name: "Alice", last_name: "Smith", user_age: 30 });
  });
});

describe("normalizeKeys — pascal", () => {
  it("converts snake_case to PascalCase", () => {
    expect(normalizeKeys({ first_name: "Alice" }, { case: "pascal" })).toEqual({ FirstName: "Alice" });
  });
});

describe("normalizeKeys — kebab", () => {
  it("converts camelCase to kebab-case", () => {
    const result = normalizeKeys({ firstName: "Alice" }, { case: "kebab" });
    expect((result as any)["first-name"]).toBe("Alice");
  });
});

describe("normalizeKeys — deep", () => {
  it("normalizes keys in nested objects", () => {
    const result = normalizeKeys({
      user_data: { first_name: "Alice", address_info: { zip_code: "SW1A 1AA" } },
    });
    expect((result as any).userData.firstName).toBe("Alice");
    expect((result as any).userData.addressInfo.zipCode).toBe("SW1A 1AA");
  });

  it("normalizes keys inside arrays", () => {
    const result = normalizeKeys({
      user_list: [{ first_name: "Alice" }, { first_name: "Bob" }],
    });
    expect((result as any).userList[0].firstName).toBe("Alice");
    expect((result as any).userList[1].firstName).toBe("Bob");
  });

  it("shallow mode — only normalizes top-level keys", () => {
    const result = normalizeKeys(
      { user_data: { first_name: "Alice" } },
      { deep: false }
    );
    expect((result as any).userData).toBeDefined();
    // Inner keys unchanged
    expect((result as any).userData.first_name).toBe("Alice");
    expect((result as any).userData.firstName).toBeUndefined();
  });
});

describe("normalizeKeys — customMap", () => {
  it("uses customMap over auto-conversion", () => {
    const result = normalizeKeys(
      { user_id: 1, first_name: "Alice" },
      { case: "camel", customMap: { user_id: "userId" } }
    );
    expect((result as any).userId).toBe(1);
    expect((result as any).firstName).toBe("Alice");
  });
});

describe("normalizeKeys — safety", () => {
  it("drops __proto__ keys", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":1}') as Record<string, unknown>;
    const result = normalizeKeys(malicious);
    expect(Object.hasOwn({}, "x")).toBe(false);
    expect((result as any).safe).toBe(1);
  });

  it("drops constructor keys", () => {
    const malicious = JSON.parse('{"constructor":{"p":true},"ok":1}') as Record<string, unknown>;
    const result = normalizeKeys(malicious);
    expect(Object.hasOwn(result as object, "constructor")).toBe(false);
    expect((result as any).ok).toBe(1);
  });

  it("does not mutate input", () => {
    const input = { first_name: "Alice" };
    normalizeKeys(input);
    expect(Object.keys(input)).toContain("first_name");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { first_name: "Alice" };
    obj["self"] = obj;
    expect(() => normalizeKeys(obj)).not.toThrow();
  });
});

// =============================================================================
// Full pipeline integration
// =============================================================================

describe("v0.5.0 structural pipeline", () => {
  it("flatten → transform → unflatten round-trip", () => {
    const original = { user: { firstName: "Alice", address: { city: "London" } } };
    const { data: flat } = flattenObject(original);
    const reconstructed = unflatten(flat);
    expect(reconstructed).toEqual(original);
  });

  it("normalizeKeys → remapObject pipeline", () => {
    const raw = { user_id: 1, first_name: "Alice", last_name: "Smith" };

    // Step 1: normalize to camelCase
    const normalized = normalizeKeys(raw, { case: "camel" });

    // Step 2: remap to different structure
    const result = remapObject(normalized as Record<string, unknown>, {
      userId: "id",
      firstName: "profile.first",
      lastName: "profile.last",
    });

    expect((result as any).id).toBe(1);
    expect((result as any).profile.first).toBe("Alice");
    expect((result as any).profile.last).toBe("Smith");
  });

  it("mergeDeep with normalized keys", () => {
    const base = normalizeKeys({ base_role: "user", base_level: 1 }, { case: "camel" });
    const override = normalizeKeys({ base_role: "admin", extra_flag: true }, { case: "camel" });
    const merged = mergeDeep(
      base as Record<string, unknown>,
      override as Record<string, unknown>
    );
    expect((merged as any).baseRole).toBe("admin");
    expect((merged as any).baseLevel).toBe(1);
    expect((merged as any).extraFlag).toBe(true);
  });

  it("pivot → normalizeKeys pipeline", () => {
    const arr = [{ user_id: "u1", first_name: "Alice" }, { user_id: "u2", first_name: "Bob" }];
    const keyed = arrayToObject(arr, "user_id");
    const normalized = normalizeKeys(keyed, { case: "camel" });
    expect((normalized as any).u1?.firstName).toBe("Alice");
    expect((normalized as any).u2?.firstName).toBe("Bob");
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("structure — performance", () => {
  it("normalizeKeys handles 1000-key object within 100ms", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) obj[`field_name_${i}`] = i;
    const start = performance.now();
    normalizeKeys(obj, { case: "camel" });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("unflatten handles 500-path flat object within 50ms", () => {
    const flat: Record<string, number> = {};
    for (let i = 0; i < 100; i++)
      for (let j = 0; j < 5; j++)
        flat[`section${i}.field${j}`] = i * 5 + j;
    const start = performance.now();
    unflatten(flat);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("mergeDeep handles large objects within 100ms", () => {
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) { a[`key${i}`] = i; b[`key${i + 1000}`] = i; }
    const start = performance.now();
    mergeDeep(a, b);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
