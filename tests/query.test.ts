// =============================================================================
// tests/query.test.ts
// Full test suite for v0.8.0 — Query, Search & Aggregation Layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { from, QueryBuilder } from "../src/query/builder.js";
import { search, searchAny } from "../src/query/search.js";
import { queryPath, get, getAll } from "../src/query/jsonpath.js";
import { groupBy, sum, avg, min, max, distinct } from "../src/query/aggregate.js";
import { compilePathPredicate } from "../src/query/where.js";

// ── Test data ─────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  age: number;
  country: string;
  salary: number;
  active: boolean;
  role: string;
  email: string;
}

const users: User[] = [
  { id: 1, name: "Alice",   age: 30, country: "IN", salary: 75000, active: true,  role: "admin",  email: "alice@test.com"   },
  { id: 2, name: "Bob",     age: 22, country: "US", salary: 55000, active: true,  role: "user",   email: "bob@test.com"     },
  { id: 3, name: "Carol",   age: 35, country: "IN", salary: 90000, active: false, role: "admin",  email: "carol@test.com"   },
  { id: 4, name: "Dan",     age: 28, country: "UK", salary: 60000, active: true,  role: "user",   email: "dan@test.com"     },
  { id: 5, name: "Eve",     age: 19, country: "US", salary: 45000, active: false, role: "user",   email: "eve@test.com"     },
  { id: 6, name: "Frank",   age: 42, country: "IN", salary: 120000,active: true,  role: "admin",  email: "frank@test.com"   },
];

// =============================================================================
// from() — entry point
// =============================================================================

describe("from()", () => {
  it("creates a QueryBuilder", () => {
    expect(from(users)).toBeInstanceOf(QueryBuilder);
  });

  it("throws for non-array input", () => {
    expect(() => from({} as unknown as [])).toThrow();
  });

  it("handles empty array", () => {
    expect(from([]).toArray()).toEqual([]);
  });

  it("does not mutate original array", () => {
    const arr = [1, 2, 3];
    from(arr).toArray();
    expect(arr).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// where() — filtering
// =============================================================================

describe("where() — function predicate", () => {
  it("filters items", () => {
    const result = from(users).where(x => x.age > 25).toArray();
    expect(result.every(u => u.age > 25)).toBe(true);
    expect(result.length).toBe(4);
  });

  it("handles predicate that throws — item excluded", () => {
    const result = from(users).where(() => { throw new Error(); }).toArray();
    expect(result).toHaveLength(0);
  });
});

describe("where() — path-based operators", () => {
  it("eq operator", () => {
    const r = from(users).where("country", "eq", "IN").toArray();
    expect(r.every(u => u.country === "IN")).toBe(true);
  });

  it("= alias", () => {
    expect(from(users).where("country", "=", "IN").count()).toBe(3);
  });

  it("ne operator", () => {
    expect(from(users).where("role", "ne", "admin").count()).toBe(3);
  });

  it("gt operator", () => {
    expect(from(users).where("age", "gt", 30).toArray().every(u => u.age > 30)).toBe(true);
  });

  it("> alias", () => {
    expect(from(users).where("age", ">", 30).count()).toBe(2);
  });

  it("gte operator", () => {
    expect(from(users).where("age", "gte", 30).count()).toBe(3);
  });

  it("lt operator", () => {
    expect(from(users).where("age", "lt", 25).count()).toBe(2);
  });

  it("lte operator", () => {
    expect(from(users).where("age", "lte", 22).count()).toBe(2);
  });

  it("in operator", () => {
    const r = from(users).where("country", "in", ["IN", "US"]).toArray();
    expect(r.every(u => ["IN","US"].includes(u.country))).toBe(true);
    expect(r.length).toBe(5);
  });

  it("contains operator — string", () => {
    const r = from(users).where("name", "contains", "al").toArray();
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(u => u.name.toLowerCase().includes("al"))).toBe(true);
  });

  it("chained where — AND semantics", () => {
    const r = from(users)
      .where("country", "eq", "IN")
      .where("active", "eq", true)
      .toArray();
    expect(r.every(u => u.country === "IN" && u.active)).toBe(true);
  });

  it("ignores unsafe path segments", () => {
    const result = from(users).where("__proto__.polluted", "eq", true).toArray();
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// select()
// =============================================================================

describe("select() — projector", () => {
  it("projects to new shape", () => {
    const r = from(users).select(x => ({ name: x.name, age: x.age })).toArray();
    expect(r[0]).toEqual({ name: "Alice", age: 30 });
    expect(Object.keys(r[0]!)).toHaveLength(2);
  });

  it("handles projector that throws — returns original item", () => {
    const r = from([1]).select(() => { throw new Error(); }).toArray();
    expect(r).toEqual([1]);
  });
});

describe("select() — path array", () => {
  it("extracts specified paths", () => {
    const r = from(users).select(["name", "country"]).toArray();
    expect(r[0]).toHaveProperty("name", "Alice");
    expect(r[0]).toHaveProperty("country", "IN");
    expect(Object.keys(r[0]!)).toHaveLength(2);
  });
});

// =============================================================================
// selectMany()
// =============================================================================

describe("selectMany()", () => {
  it("flattens nested arrays", () => {
    const data = [
      { name: "Alice", tags: ["a", "b"] },
      { name: "Bob",   tags: ["c"] },
    ];
    const result = from(data).selectMany(x => x.tags).toArray();
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("handles empty inner arrays", () => {
    const data = [{ items: [] }, { items: [1, 2] }];
    expect(from(data).selectMany(x => x.items).toArray()).toEqual([1, 2]);
  });
});

// =============================================================================
// orderBy / orderByDesc
// =============================================================================

describe("orderBy()", () => {
  it("sorts ascending", () => {
    const r = from(users).orderBy(x => x.age).toArray();
    expect(r[0]!.age).toBe(19);
    expect(r[r.length - 1]!.age).toBe(42);
  });

  it("sorts descending", () => {
    const r = from(users).orderByDesc(x => x.age).toArray();
    expect(r[0]!.age).toBe(42);
    expect(r[r.length - 1]!.age).toBe(19);
  });

  it("sorts strings lexicographically", () => {
    const r = from(users).orderBy(x => x.name).toArray();
    expect(r[0]!.name).toBe("Alice");
  });

  it("handles null values — placed last", () => {
    const data = [{ v: 3 }, { v: null as unknown as number }, { v: 1 }];
    const r = from(data).orderBy(x => x.v).toArray();
    expect(r[0]!.v).toBe(1);
    expect(r[r.length - 1]!.v).toBeNull();
  });
});

// =============================================================================
// take / skip
// =============================================================================

describe("take()", () => {
  it("returns first N items", () => {
    const r = from(users).take(2).toArray();
    expect(r).toHaveLength(2);
    expect(r[0]!.name).toBe("Alice");
  });

  it("returns all when N > length", () => {
    expect(from(users).take(100).count()).toBe(6);
  });
});

describe("skip()", () => {
  it("skips first N items", () => {
    const r = from(users).skip(4).toArray();
    expect(r).toHaveLength(2);
  });

  it("skip 0 returns all", () => {
    expect(from(users).skip(0).count()).toBe(6);
  });
});

// =============================================================================
// Terminal operations
// =============================================================================

describe("first() / last()", () => {
  it("first() returns first item", () => {
    expect(from(users).first()!.name).toBe("Alice");
  });

  it("first() returns undefined for empty result", () => {
    expect(from(users).where(x => x.age > 100).first()).toBeUndefined();
  });

  it("last() returns last item", () => {
    expect(from(users).last()!.name).toBe("Frank");
  });
});

describe("any() / all()", () => {
  it("any() returns true when items exist", () => {
    expect(from(users).where(x => x.active).any()).toBe(true);
    expect(from(users).where(x => x.age > 100).any()).toBe(false);
  });

  it("all() returns true when all items satisfy predicate", () => {
    expect(from(users).where(x => x.active).all(x => x.id > 0)).toBe(true);
    expect(from(users).all(x => x.active)).toBe(false);
  });
});

describe("count()", () => {
  it("returns correct count after filter", () => {
    expect(from(users).where(x => x.country === "IN").count()).toBe(3);
  });
});

// =============================================================================
// search() integration on QueryBuilder
// =============================================================================

describe("QueryBuilder.search()", () => {
  it("filters items containing keyword", () => {
    const r = from(users).search("alice").toArray();
    expect(r.some(u => u.name === "Alice")).toBe(true);
  });

  it("OR matches multiple keywords", () => {
    const r = from(users).search(["alice", "bob"]).toArray();
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for no matches", () => {
    expect(from(users).search("zzznotfound").toArray()).toHaveLength(0);
  });
});

// =============================================================================
// Aggregations
// =============================================================================

describe("groupBy()", () => {
  it("groups by string field", () => {
    const groups = from(users).groupBy(x => x.country);
    expect(groups.length).toBe(3); // IN, US, UK
    const inGroup = groups.find(g => g.key === "IN");
    expect(inGroup?.count).toBe(3);
  });

  it("each group has frozen items", () => {
    const groups = from(users).groupBy(x => x.role);
    expect(Object.isFrozen(groups[0])).toBe(true);
  });
});

describe("sum()", () => {
  it("sums numeric values", () => {
    expect(from(users).sum(x => x.salary)).toBe(445000);
  });

  it("returns 0 for empty array", () => {
    expect(from([]).sum((x: number) => x)).toBe(0);
  });

  it("sums after filter", () => {
    const result = from(users).where(x => x.country === "IN").sum(x => x.salary);
    expect(result).toBe(75000 + 90000 + 120000);
  });
});

describe("avg()", () => {
  it("computes average", () => {
    const result = from(users).avg(x => x.age);
    const expected = users.reduce((a, u) => a + u.age, 0) / users.length;
    expect(result).toBeCloseTo(expected);
  });

  it("returns NaN for empty", () => {
    expect(from([]).avg((x: number) => x)).toBeNaN();
  });
});

describe("min()", () => {
  it("returns minimum", () => {
    expect(from(users).min(x => x.age)).toBe(19);
  });

  it("returns Infinity for empty", () => {
    expect(from([]).min((x: number) => x)).toBe(Infinity);
  });
});

describe("max()", () => {
  it("returns maximum", () => {
    expect(from(users).max(x => x.salary)).toBe(120000);
  });

  it("returns -Infinity for empty", () => {
    expect(from([]).max((x: number) => x)).toBe(-Infinity);
  });
});

describe("distinct()", () => {
  it("returns unique values", () => {
    const d = from(users).distinct(x => x.country);
    expect(d).toHaveLength(3);
    expect(d).toContain("IN");
    expect(d).toContain("US");
    expect(d).toContain("UK");
  });

  it("preserves insertion order", () => {
    const d = from(users).distinct(x => x.country);
    expect(d[0]).toBe("IN");
  });
});

// =============================================================================
// Standalone aggregation functions
// =============================================================================

describe("standalone aggregate functions", () => {
  it("groupBy()", () => {
    const groups = groupBy(users, u => u.role);
    expect(groups.find(g => g.key === "admin")?.count).toBe(3);
  });

  it("sum()", () => expect(sum(users, u => u.age)).toBe(users.reduce((a,u)=>a+u.age,0)));
  it("avg()", () => expect(avg(users, u => u.age)).toBeCloseTo(sum(users, u=>u.age)/users.length));
  it("min()", () => expect(min(users, u => u.age)).toBe(19));
  it("max()", () => expect(max(users, u => u.salary)).toBe(120000));
  it("distinct()", () => expect(distinct(users, u => u.country)).toHaveLength(3));
});

// =============================================================================
// search() standalone
// =============================================================================

describe("search() standalone", () => {
  it("finds partial matches case-insensitively", () => {
    const r = search({ user: { name: "Alice", city: "London" } }, "alice");
    expect(r[0]?.path).toBe("user.name");
    expect(r[0]?.value).toBe("Alice");
  });

  it("returns empty for no match", () => {
    expect(search({ a: "hello" }, "xyz")).toHaveLength(0);
  });

  it("OR matches multiple keywords", () => {
    const r = search({ a: "foo", b: "bar", c: "baz" }, ["foo", "baz"]);
    expect(r.length).toBe(2);
  });

  it("searches numbers by stringifying", () => {
    const r = search({ id: 42 }, "42");
    expect(r[0]?.value).toBe(42);
  });

  it("respects limit option", () => {
    const r = search({ a: "cat", b: "cat", c: "cat" }, "cat", { limit: 2 });
    expect(r).toHaveLength(2);
  });

  it("stringsOnly skips non-strings", () => {
    const r = search({ a: "cat", b: 42 }, "42", { stringsOnly: true });
    expect(r).toHaveLength(0);
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { name: "Alice" };
    obj["self"] = obj;
    expect(() => search(obj, "alice")).not.toThrow();
  });

  it("searchAny returns boolean", () => {
    expect(searchAny({ name: "Alice" }, "alice")).toBe(true);
    expect(searchAny({ name: "Bob" }, "xyz")).toBe(false);
  });
});

// =============================================================================
// JSONPath
// =============================================================================

describe("queryPath()", () => {
  const data = {
    users: [
      { id: 1, name: "Alice", address: { city: "London" } },
      { id: 2, name: "Bob",   address: { city: "Birmingham"  } },
    ],
    meta: { id: 99, active: true },
  };

  it("dot notation — simple path", () => {
    const r = queryPath(data, "meta.id");
    expect(r[0]?.value).toBe(99);
    expect(r[0]?.path).toBe("meta.id");
  });

  it("bracket array index", () => {
    expect(queryPath(data, "users[0].name")[0]?.value).toBe("Alice");
    expect(queryPath(data, "users[1].name")[0]?.value).toBe("Bob");
  });

  it("array wildcard [*]", () => {
    const r = queryPath(data, "users[*].name");
    expect(r.map(x => x.value)).toEqual(["Alice", "Bob"]);
  });

  it("deep glob **", () => {
    const r = queryPath(data, "**.id");
    const ids = r.map(x => x.value);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(99);
  });

  it("nested dot after wildcard", () => {
    const r = queryPath(data, "users[*].address.city");
    expect(r.map(x => x.value)).toEqual(["London", "Birmingham"]);
  });

  it("returns empty for non-existent path", () => {
    expect(queryPath(data, "users[0].missing")).toHaveLength(0);
  });

  it("returns empty for unsafe path", () => {
    expect(queryPath(data, "__proto__.polluted")).toHaveLength(0);
  });
});

describe("get()", () => {
  const data = { user: { name: "Alice", scores: [10, 20, 30] } };
  it("returns value for dot path", () => expect(get(data, "user.name")).toBe("Alice"));
  it("returns first wildcard match", () => {
    expect(get({ users: [{ id: 1 }, { id: 2 }] }, "users[*].id")).toBe(1);
  });
  it("returns undefined for missing path", () => expect(get(data, "user.missing")).toBeUndefined());
});

describe("getAll()", () => {
  it("returns all wildcard matches", () => {
    const data = { users: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(getAll(data, "users[*].id")).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// compilePathPredicate
// =============================================================================

describe("compilePathPredicate()", () => {
  it("compiles contains operator", () => {
    const pred = compilePathPredicate("name", "contains", "ali");
    expect(pred({ name: "Alice" }, 0)).toBe(true);
    expect(pred({ name: "Bob" }, 0)).toBe(false);
  });

  it("returns false for unsafe key", () => {
    const pred = compilePathPredicate("__proto__", "eq", "value");
    expect(pred({}, 0)).toBe(false);
  });
});

// =============================================================================
// Pipeline integration — full LINQ chain
// =============================================================================

describe("full LINQ pipeline", () => {
  it("filter → sort → paginate → aggregate", () => {
    const total = from(users)
      .where(x => x.active)
      .orderByDesc(x => x.salary)
      .take(3)
      .sum(x => x.salary);
    // Top 3 active by salary: Frank(120000), Carol is inactive, so: Alice(75000), Dan(60000)... wait: active = Alice,Bob,Dan,Frank
    // Sorted desc: Frank(120k), Alice(75k), Dan(60k), Bob(55k) → take 3 → Frank+Alice+Dan = 255000
    expect(total).toBe(120000 + 75000 + 60000);
  });

  it("filter → groupBy → count per group", () => {
    const groups = from(users)
      .where(x => x.active)
      .groupBy(x => x.country);
    const inGroup = groups.find(g => g.key === "IN");
    expect(inGroup?.count).toBe(2); // Alice and Frank active in IN
  });

  it("selectMany flattens nested then filters", () => {
    const data = [
      { dept: "Engineering", members: ["Alice", "Bob"] },
      { dept: "Marketing",   members: ["Carol"] },
    ];
    const result = from(data)
      .selectMany(x => x.members)
      .where((x: unknown) => (x as string).startsWith("A"))
      .toArray();
    expect(result).toEqual(["Alice"]);
  });

  it("works with masking layer (v0.6)", async () => {
    const { maskSensitiveDirect } = await import("../src/security/mask.js");
    const data = [
      { name: "Alice", email: "alice@test.com", salary: 75000 },
      { name: "Bob",   email: "bob@test.com",   salary: 55000 },
    ];
    const masked = maskSensitiveDirect(data, { fields: ["**.email"], mode: "full" });
    const result = from(masked as typeof data)
      .where(x => x.salary > 60000)
      .select(x => ({ name: x.name, salary: x.salary }))
      .toArray();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Alice");
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("query — performance", () => {
  it("filters 50k items within 200ms", () => {
    const big = Array.from({ length: 50000 }, (_, i) => ({
      id: i,
      active: i % 2 === 0,
      country: ["IN","US","UK"][i % 3]!,
      salary: 30000 + (i % 70000),
    }));
    const start = performance.now();
    const result = from(big)
      .where(x => x.active && x.country === "IN")
      .sum(x => x.salary);
    const duration = performance.now() - start;
    expect(result).toBeGreaterThan(0);
    expect(duration).toBeLessThan(200);
  });

  it("search handles 1000 items within 100ms", () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({
      name: `User${i}`, email: `user${i}@test.com`, age: 20 + (i % 50),
    }));
    const start = performance.now();
    const r = from(big).search("user500").toArray();
    expect(performance.now() - start).toBeLessThan(100);
    expect(r.length).toBeGreaterThan(0);
  });
});
