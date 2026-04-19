// =============================================================================
// tests/query.edge.test.ts
// Additional edge cases for v0.8.0 query layer branch coverage
// =============================================================================

import { describe, it, expect } from "vitest";
import { from } from "../src/query/builder.js";
import { search } from "../src/query/search.js";
import { queryPath, get, getAll } from "../src/query/jsonpath.js";
import { groupBy, sum, avg, min, max, distinct } from "../src/query/aggregate.js";
import { compilePathPredicate } from "../src/query/where.js";

// =============================================================================
// aggregate.ts — branch coverage
// =============================================================================

describe("groupBy — edge cases", () => {
  it("groups by boolean key", () => {
    const data = [{ a: true }, { a: false }, { a: true }];
    const groups = groupBy(data, x => x.a);
    expect(groups.length).toBe(2);
    expect(groups.find(g => g.key === true)?.count).toBe(2);
  });

  it("groups by object key (JSON serialised)", () => {
    const data = [{ k: { x: 1 } }, { k: { x: 1 } }, { k: { x: 2 } }];
    const groups = groupBy(data, x => x.k);
    expect(groups.length).toBe(2);
  });

  it("handles selector that throws — item skipped", () => {
    const data = [1, 2, 3];
    const groups = groupBy(data, () => { throw new Error(); });
    expect(groups).toHaveLength(0);
  });

  it("empty array returns empty groups", () => {
    expect(groupBy([], x => x)).toHaveLength(0);
  });
});

describe("sum — edge cases", () => {
  it("ignores non-finite values", () => {
    const data = [{ v: 1 }, { v: Infinity }, { v: NaN }, { v: 2 }];
    expect(sum(data, x => x.v)).toBe(3);
  });

  it("handles selector that throws — treated as 0", () => {
    const data = [{ v: 1 }, { v: 2 }];
    let calls = 0;
    const result = sum(data, x => {
      if (++calls === 1) throw new Error();
      return x.v;
    });
    expect(result).toBe(2); // 0 + 2
  });
});

describe("avg — edge cases", () => {
  it("handles non-finite values by ignoring them in sum but counting all items", () => {
    // avg divides total sum by items.length including non-finite items
    const data = [{ v: 10 }, { v: 20 }];
    expect(avg(data, x => x.v)).toBe(15);
  });
});

describe("min — edge cases", () => {
  it("ignores non-finite values", () => {
    const data = [{ v: Infinity }, { v: 5 }, { v: 3 }];
    expect(min(data, x => x.v)).toBe(3);
  });

  it("handles selector that throws — item skipped", () => {
    const data = [{ v: 5 }, { v: 3 }];
    let calls = 0;
    const result = min(data, x => {
      if (++calls === 1) throw new Error();
      return x.v;
    });
    expect(result).toBe(3);
  });
});

describe("max — edge cases", () => {
  it("ignores non-finite values", () => {
    const data = [{ v: -Infinity }, { v: 5 }, { v: 3 }];
    expect(max(data, x => x.v)).toBe(5);
  });

  it("handles selector that throws — item skipped", () => {
    const data = [{ v: 5 }, { v: 3 }];
    let calls = 0;
    const result = max(data, x => {
      if (++calls === 1) throw new Error();
      return x.v;
    });
    expect(result).toBe(3);
  });
});

describe("distinct — edge cases", () => {
  it("handles boolean keys", () => {
    const data = [{ a: true }, { a: false }, { a: true }];
    expect(distinct(data, x => x.a)).toHaveLength(2);
  });

  it("handles selector that throws — item skipped", () => {
    const data = [1, 2, 3];
    const result = distinct(data, () => { throw new Error(); });
    expect(result).toHaveLength(0);
  });

  it("empty input returns empty", () => {
    expect(distinct([], x => x)).toHaveLength(0);
  });
});

// =============================================================================
// search.ts — branch coverage
// =============================================================================

describe("search — edge cases", () => {
  it("empty keywords array returns empty", () => {
    expect(search({ a: "hello" }, [])).toHaveLength(0);
  });

  it("wholeWord option — no partial match", () => {
    const r = search({ text: "alice at home" }, "ali", { wholeWord: true });
    // "ali" is not a whole word
    expect(r).toHaveLength(0);
  });

  it("wholeWord option — matches whole word", () => {
    const r = search({ text: "alice at home" }, "alice", { wholeWord: true });
    expect(r).toHaveLength(1);
  });

  it("null values are skipped", () => {
    expect(search({ a: null }, "null")).toHaveLength(0);
  });

  it("handles deeply nested arrays", () => {
    const data = { list: [{ nested: [{ val: "found" }] }] };
    const r = search(data, "found");
    expect(r).toHaveLength(1);
    expect(r[0]?.value).toBe("found");
  });

  it("path starts from root without leading dot", () => {
    const r = search({ name: "Alice" }, "alice");
    expect(r[0]?.path).toBe("name");
    expect(r[0]?.path).not.toMatch(/^\./);
  });

  it("array indices in path", () => {
    const r = search({ users: [{ name: "Alice" }] }, "alice");
    expect(r[0]?.path).toContain("users");
  });
});

// =============================================================================
// jsonpath.ts — branch coverage
// =============================================================================

describe("queryPath — edge cases", () => {
  it("returns empty for empty path", () => {
    expect(queryPath({ a: 1 }, "")).toHaveLength(0);
  });

  it("returns empty for null data", () => {
    expect(queryPath(null, "a.b")).toHaveLength(0);
  });

  it("handles * wildcard key", () => {
    const data = { a: 1, b: 2, c: 3 };
    const r = queryPath(data, "*");
    expect(r.map(x => x.value)).toContain(1);
    expect(r.map(x => x.value)).toContain(2);
  });

  it("handles index out of bounds", () => {
    const data = { arr: [1, 2] };
    expect(queryPath(data, "arr[99]")).toHaveLength(0);
  });

  it("named key in brackets treated as string key", () => {
    const data = { map: { key: "value" } };
    const r = queryPath(data, "map[key]");
    expect(r[0]?.value).toBe("value");
  });

  it("deep glob at start of path", () => {
    const data = { a: { b: { c: 42 } } };
    const r = queryPath(data, "**.c");
    expect(r[0]?.value).toBe(42);
  });

  it("wildcard on plain object iterates all values", () => {
    const data = { meta: { x: 1, y: 2 } };
    const r = queryPath(data, "meta.*");
    expect(r.map(x => x.value)).toContain(1);
    expect(r.map(x => x.value)).toContain(2);
  });
});

describe("get / getAll — edge cases", () => {
  it("get returns undefined for empty path", () => {
    expect(get({ a: 1 }, "")).toBeUndefined();
  });

  it("getAll returns all matches for deep glob", () => {
    const data = { a: { id: 1 }, b: { id: 2 }, c: { id: 3 } };
    const ids = getAll(data, "**.id");
    expect(ids.length).toBe(3);
  });
});

// =============================================================================
// where.ts — operator coverage
// =============================================================================

describe("compilePathPredicate — operator coverage", () => {
  it("ne operator", () => {
    const pred = compilePathPredicate("x", "ne", 5);
    expect(pred({ x: 3 }, 0)).toBe(true);
    expect(pred({ x: 5 }, 0)).toBe(false);
  });

  it("gte operator", () => {
    const pred = compilePathPredicate("x", "gte", 5);
    expect(pred({ x: 5 }, 0)).toBe(true);
    expect(pred({ x: 4 }, 0)).toBe(false);
  });

  it("lte operator", () => {
    const pred = compilePathPredicate("x", "lte", 5);
    expect(pred({ x: 5 }, 0)).toBe(true);
    expect(pred({ x: 6 }, 0)).toBe(false);
  });

  it("in operator — not in list", () => {
    const pred = compilePathPredicate("x", "in", ["a", "b"]);
    expect(pred({ x: "c" }, 0)).toBe(false);
  });

  it("in operator — non-array right operand returns false", () => {
    const pred = compilePathPredicate("x", "in", "notAnArray");
    expect(pred({ x: "notAnArray" }, 0)).toBe(false);
  });

  it("contains on array", () => {
    const pred = compilePathPredicate("tags", "contains", "admin");
    expect(pred({ tags: ["user", "admin"] }, 0)).toBe(true);
    expect(pred({ tags: ["user"] }, 0)).toBe(false);
  });

  it("contains on non-string/array returns false", () => {
    const pred = compilePathPredicate("x", "contains", "val");
    expect(pred({ x: 42 }, 0)).toBe(false);
  });

  it("default/unknown operator treated as eq", () => {
    const pred = compilePathPredicate("x", "==" as never, 5);
    expect(pred({ x: 5 }, 0)).toBe(true);
  });

  it("gt with non-numbers returns false", () => {
    const pred = compilePathPredicate("x", "gt", 5);
    expect(pred({ x: "string" }, 0)).toBe(false);
  });
});

// =============================================================================
// QueryBuilder — additional edge cases
// =============================================================================

describe("QueryBuilder — edge cases", () => {
  it("chained orderBy + take + skip", () => {
    const r = from([5, 3, 1, 4, 2]).orderBy(x => x).skip(1).take(3).toArray();
    expect(r).toEqual([2, 3, 4]);
  });

  it("select with path array on nested data", () => {
    const data = [{ user: { name: "Alice", age: 30 } }];
    const r = from(data).select(["user.name"]).toArray();
    expect((r[0] as Record<string, unknown>)?.["user.name"]).toBe("Alice");
  });

  it("where() with == alias", () => {
    const r = from([{ x: 5 }, { x: 3 }]).where("x", "==", 5).toArray();
    expect(r).toHaveLength(1);
  });

  it("all() returns true for empty (vacuously true)", () => {
    expect(from([]).all(() => false)).toBe(true);
  });

  it("all() with predicate that throws — item fails", () => {
    expect(from([1]).all(() => { throw new Error(); })).toBe(false);
  });

  it("selectMany handles non-array projector result", () => {
    const r = from([1]).selectMany(() => { throw new Error(); }).toArray();
    expect(r).toEqual([]);
  });

  it("orderBy handles equal values stably", () => {
    const data = [{ a: 1, b: "x" }, { a: 1, b: "y" }];
    const r = from(data).orderBy(x => x.a).toArray();
    expect(r).toHaveLength(2);
  });
});
