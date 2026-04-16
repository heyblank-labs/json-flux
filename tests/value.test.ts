// =============================================================================
// tests/value.test.ts
// Full test suite for v0.4.0 — Value Transformation Layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { formatDate, createDateFormatter } from "../src/value/formatters/date.js";
import { formatCurrency, createCurrencyFormatter } from "../src/value/formatters/currency.js";
import { formatBoolean, createBooleanFormatter, formatNumber, createNumberFormatter } from "../src/value/formatters/boolean.js";
import { formatEnum, createEnumFormatter } from "../src/value/formatters/enum.js";
import { detectType, isDateLike, isNumericLike } from "../src/value/detect.js";
import { applyDefaults } from "../src/value/defaults.js";
import { injectComputedFields } from "../src/value/computed.js";
import { transformValues, transformValuesDirect } from "../src/value/transform.js";
import { excludeKeysDirect } from "../src/filter/exclude.js";

// =============================================================================
// Type Detection
// =============================================================================

describe("detectType — primitives", () => {
  it("detects null", () => expect(detectType(null).type).toBe("null"));
  it("detects undefined", () => expect(detectType(undefined).type).toBe("null"));
  it("detects boolean", () => {
    expect(detectType(true).type).toBe("boolean");
    expect(detectType(false).type).toBe("boolean");
    expect(detectType(true).confidence).toBe(1);
  });
  it("detects number", () => {
    expect(detectType(42).type).toBe("number");
    expect(detectType(-3.14).type).toBe("number");
    expect(detectType(0).type).toBe("number");
  });
  it("detects array", () => expect(detectType([1, 2]).type).toBe("array"));
  it("detects object", () => expect(detectType({ a: 1 }).type).toBe("object"));
});

describe("detectType — string specialization", () => {
  it("detects ISO date", () => {
    const r = detectType("2024-01-15");
    expect(r.type).toBe("date");
    expect(r.confidence).toBeGreaterThan(0.9);
  });
  it("detects ISO datetime", () => {
    expect(detectType("2024-01-15T10:30:00Z").type).toBe("date");
  });
  it("detects email", () => {
    expect(detectType("alice@example.com").type).toBe("email");
    expect(detectType("alice@example.com").confidence).toBeGreaterThan(0.8);
  });
  it("detects URL", () => {
    expect(detectType("https://example.com/path").type).toBe("url");
  });
  it("detects numeric string", () => {
    expect(detectType("42").type).toBe("number");
  });
  it("detects plain string", () => {
    expect(detectType("hello world").type).toBe("string");
  });
  it("returns string for empty string", () => {
    expect(detectType("").type).toBe("string");
  });
});

describe("isDateLike", () => {
  it("returns true for ISO date string", () => expect(isDateLike("2024-01-15")).toBe(true));
  it("returns true for positive number", () => expect(isDateLike(1705276800000)).toBe(true));
  it("returns false for plain string", () => expect(isDateLike("hello")).toBe(false));
  it("returns false for null", () => expect(isDateLike(null)).toBe(false));
});

describe("isNumericLike", () => {
  it("returns true for number", () => expect(isNumericLike(42)).toBe(true));
  it("returns true for numeric string", () => expect(isNumericLike("3.14")).toBe(true));
  it("returns false for non-numeric string", () => expect(isNumericLike("abc")).toBe(false));
  it("returns false for null", () => expect(isNumericLike(null)).toBe(false));
  it("returns false for empty string", () => expect(isNumericLike("")).toBe(false));
});

// =============================================================================
// Date Formatter
// =============================================================================

describe("formatDate — basic", () => {
  it("formats ISO date with default format", () => {
    const result = formatDate("2024-01-15");
    expect(result).toBe("15 Jan 2024");
  });
  it("formats with YYYY-MM-DD format", () => {
    expect(formatDate("2024-01-15", { format: "YYYY-MM-DD" })).toBe("2024-01-15");
  });
  it("formats with MM/DD/YYYY", () => {
    expect(formatDate("2024-01-15", { format: "MM/DD/YYYY" })).toBe("01/15/2024");
  });
  it("formats with full month name", () => {
    expect(formatDate("2024-01-15", { format: "MMMM D, YYYY" })).toBe("January 15, 2024");
  });
  it("formats with short year", () => {
    expect(formatDate("2024-01-15", { format: "DD/MM/YY" })).toBe("15/01/24");
  });
  it("returns fallback for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
  it("returns custom fallback", () => {
    expect(formatDate("invalid", { fallback: "N/A" })).toBe("N/A");
  });
  it("formats timestamp (ms)", () => {
    // 2024-01-15 UTC
    const ts = new Date("2024-01-15").getTime();
    const result = formatDate(ts, { format: "YYYY" });
    expect(result).toBe("2024");
  });
  it("handles datetime with time components", () => {
    const result = formatDate("2024-01-15T10:30:00Z", { format: "DD MMM YYYY HH:mm" });
    expect(result).toContain("2024");
    expect(result).toContain("Jan");
  });
});

describe("createDateFormatter", () => {
  it("creates reusable formatter", () => {
    const fmt = createDateFormatter({ format: "YYYY-MM-DD" });
    expect(fmt("2024-01-15")).toBe("2024-01-15");
    expect(fmt("2024-06-20")).toBe("2024-06-20");
  });
  it("created formatter returns fallback for invalid input", () => {
    const fmt = createDateFormatter();
    expect(fmt("bad")).toBe("—");
  });
});

// =============================================================================
// Currency Formatter
// =============================================================================

describe("formatCurrency — basic", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(1500)).toContain("1,500");
  });
  it("formats with custom currency", () => {
    const result = formatCurrency(1500, { currency: "INR", locale: "en-IN" });
    expect(result).toContain("1,500");
  });
  it("returns fallback for NaN", () => {
    expect(formatCurrency("abc")).toBe("—");
    expect(formatCurrency(null)).toBe("—");
  });
  it("returns custom fallback", () => {
    expect(formatCurrency("bad", { fallback: "N/A" })).toBe("N/A");
  });
  it("handles numeric string input", () => {
    const result = formatCurrency("1500", { currency: "USD", locale: "en-US" });
    expect(result).toContain("1,500");
  });
  it("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });
  it("handles negative numbers", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500");
  });
});

describe("createCurrencyFormatter", () => {
  it("creates reusable formatter", () => {
    const fmt = createCurrencyFormatter({ currency: "USD", locale: "en-US" });
    const r1 = fmt(1000);
    const r2 = fmt(2000);
    expect(r1).toContain("1,000");
    expect(r2).toContain("2,000");
  });
});

// =============================================================================
// Boolean Formatter
// =============================================================================

describe("formatBoolean — defaults", () => {
  it("true → Yes", () => expect(formatBoolean(true)).toBe("Yes"));
  it("false → No", () => expect(formatBoolean(false)).toBe("No"));
  it("null → —", () => expect(formatBoolean(null)).toBe("—"));
  it("undefined → —", () => expect(formatBoolean(undefined)).toBe("—"));
});

describe("formatBoolean — string inputs", () => {
  it('"true" → Yes', () => expect(formatBoolean("true")).toBe("Yes"));
  it('"false" → No', () => expect(formatBoolean("false")).toBe("No"));
  it('"yes" → Yes', () => expect(formatBoolean("yes")).toBe("Yes"));
  it('"no" → No', () => expect(formatBoolean("no")).toBe("No"));
  it('"1" → Yes', () => expect(formatBoolean("1")).toBe("Yes"));
  it('"0" → No', () => expect(formatBoolean("0")).toBe("No"));
  it('"on" → Yes', () => expect(formatBoolean("on")).toBe("Yes"));
  it('"off" → No', () => expect(formatBoolean("off")).toBe("No"));
});

describe("formatBoolean — numeric inputs", () => {
  it("1 → Yes", () => expect(formatBoolean(1)).toBe("Yes"));
  it("0 → No", () => expect(formatBoolean(0)).toBe("No"));
  it("42 → —", () => expect(formatBoolean(42)).toBe("—"));
});

describe("formatBoolean — custom labels", () => {
  it("uses custom trueLabel", () => {
    expect(formatBoolean(true, { trueLabel: "Active" })).toBe("Active");
  });
  it("uses custom falseLabel", () => {
    expect(formatBoolean(false, { falseLabel: "Inactive" })).toBe("Inactive");
  });
  it("uses custom nullLabel", () => {
    expect(formatBoolean(null, { nullLabel: "Unknown" })).toBe("Unknown");
  });
});

// =============================================================================
// Number Formatter
// =============================================================================

describe("formatNumber", () => {
  it("formats with thousands separator", () => {
    expect(formatNumber(1234567)).toContain("1,234,567");
  });
  it("formats decimals", () => {
    expect(formatNumber(3.14159, { maximumFractionDigits: 2 })).toContain("3.14");
  });
  it("returns fallback for non-numeric", () => {
    expect(formatNumber("abc")).toBe("—");
    expect(formatNumber(null)).toBe("—");
  });
  it("handles numeric string", () => {
    expect(formatNumber("42.5")).toContain("42.5");
  });
  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

// =============================================================================
// Enum Formatter
// =============================================================================

describe("formatEnum", () => {
  const statusMap = {
    map: { PENDING: "Pending Approval", APPROVED: "Approved", REJECTED: "Rejected" },
  };

  it("maps known enum value", () => {
    expect(formatEnum("PENDING", statusMap)).toBe("Pending Approval");
    expect(formatEnum("APPROVED", statusMap)).toBe("Approved");
  });
  it("returns original for unknown value (no fallback)", () => {
    expect(formatEnum("UNKNOWN", statusMap)).toBe("UNKNOWN");
  });
  it("uses fallback for unknown value", () => {
    expect(formatEnum("UNKNOWN", { ...statusMap, fallback: "N/A" })).toBe("N/A");
  });
  it("returns — for null", () => {
    expect(formatEnum(null, statusMap)).toBe("—");
  });
  it("converts number to string before lookup", () => {
    expect(formatEnum(1, { map: { "1": "One", "2": "Two" } })).toBe("One");
  });
  it("case-insensitive matching", () => {
    expect(
      formatEnum("pending", { ...statusMap, caseInsensitive: true })
    ).toBe("Pending Approval");
  });
  it("createEnumFormatter creates reusable formatter", () => {
    const fmt = createEnumFormatter(statusMap);
    expect(fmt("APPROVED")).toBe("Approved");
    expect(fmt("REJECTED")).toBe("Rejected");
  });
});

// =============================================================================
// applyDefaults
// =============================================================================

describe("applyDefaults — basic", () => {
  it("fills null field with default", () => {
    const { data } = applyDefaults({ user: { name: null } }, { "user.name": "N/A" });
    expect((data as any).user.name).toBe("N/A");
  });
  it("fills missing field", () => {
    const { data } = applyDefaults({ user: {} }, { "user.role": "viewer" });
    expect((data as any).user.role).toBe("viewer");
  });
  it("does not overwrite existing value", () => {
    const { data } = applyDefaults({ user: { name: "Alice" } }, { "user.name": "N/A" });
    expect((data as any).user.name).toBe("Alice");
  });
  it("fills bare key at any depth", () => {
    const { data } = applyDefaults(
      { user: { role: null }, admin: { role: null } },
      { role: "viewer" }
    );
    expect((data as any).user.role).toBe("viewer");
    expect((data as any).admin.role).toBe("viewer");
  });
  it("tracks defaultedPaths", () => {
    const { defaultedPaths } = applyDefaults(
      { user: { name: null, age: null } },
      { "user.name": "N/A", "user.age": 0 }
    );
    expect(defaultedPaths).toContain("user.name");
    expect(defaultedPaths).toContain("user.age");
  });
  it("does not mutate input", () => {
    const input = { user: { name: null } };
    applyDefaults(input, { "user.name": "N/A" });
    expect(input.user.name).toBeNull();
  });
});

// =============================================================================
// injectComputedFields
// =============================================================================

describe("injectComputedFields", () => {
  it("injects a simple computed field", () => {
    const { data } = injectComputedFields(
      { user: { firstName: "Alice", lastName: "Smith" } },
      {
        "user.fullName": (root) =>
          `${(root as any).user.firstName} ${(root as any).user.lastName}`,
      }
    );
    expect((data as any).user.fullName).toBe("Alice Smith");
  });

  it("preserves existing fields", () => {
    const { data } = injectComputedFields(
      { a: 1, b: 2 },
      { c: () => 3 }
    );
    expect((data as any).a).toBe(1);
    expect((data as any).b).toBe(2);
    expect((data as any).c).toBe(3);
  });

  it("creates intermediate objects for nested paths", () => {
    const { data } = injectComputedFields(
      { user: { firstName: "Alice" } },
      { "user.meta.label": (root) => `User: ${(root as any).user.firstName}` }
    );
    expect((data as any).user.meta.label).toBe("User: Alice");
  });

  it("tracks computedPaths", () => {
    const { computedPaths } = injectComputedFields(
      { a: 1 },
      { b: () => 2, c: () => 3 }
    );
    expect(computedPaths).toContain("b");
    expect(computedPaths).toContain("c");
  });

  it("handles compute function errors gracefully", () => {
    const { data } = injectComputedFields(
      { a: 1 },
      {
        b: () => {
          throw new Error("compute error");
        },
      }
    );
    expect((data as any).b).toBeNull(); // null fallback on error
  });

  it("does not mutate input", () => {
    const input = { user: { name: "Alice" } };
    injectComputedFields(input, { "user.tag": () => "x" });
    expect((input as any).user.tag).toBeUndefined();
  });
});

// =============================================================================
// transformValues — core engine
// =============================================================================

describe("transformValues — basic transforms", () => {
  it("applies date transform", () => {
    const { data } = transformValues(
      { user: { dob: "2024-01-15" } },
      { transforms: { "user.dob": { type: "date", options: { format: "DD MMM YYYY" } } } }
    );
    expect((data as any).user.dob).toBe("15 Jan 2024");
  });

  it("applies currency transform", () => {
    const { data } = transformValues(
      { order: { amount: 1500 } },
      { transforms: { "order.amount": { type: "currency", options: { currency: "USD", locale: "en-US" } } } }
    );
    expect((data as any).order.amount).toContain("1,500");
  });

  it("applies boolean transform", () => {
    const { data } = transformValues(
      { user: { active: true } },
      { transforms: { "user.active": { type: "boolean", options: { trueLabel: "Active" } } } }
    );
    expect((data as any).user.active).toBe("Active");
  });

  it("applies enum transform", () => {
    const { data } = transformValues(
      { order: { status: "PENDING" } },
      {
        transforms: {
          "order.status": {
            type: "enum",
            options: { map: { PENDING: "Pending Approval", APPROVED: "Approved" } },
          },
        },
      }
    );
    expect((data as any).order.status).toBe("Pending Approval");
  });

  it("applies number transform", () => {
    const { data } = transformValues(
      { stats: { count: 1234567 } },
      { transforms: { "stats.count": { type: "number", options: { locale: "en-US" } } } }
    );
    expect((data as any).stats.count).toContain("1,234,567");
  });

  it("applies custom function transformer", () => {
    const { data } = transformValues(
      { user: { age: 30 } },
      { transforms: { "user.age": (v) => `${v} years` } }
    );
    expect((data as any).user.age).toBe("30 years");
  });

  it("applies default transform", () => {
    const { data } = transformValues(
      { user: { name: null } },
      { transforms: { "user.name": { type: "default", value: "N/A" } } }
    );
    expect((data as any).user.name).toBe("N/A");
  });

  it("applies auto transform", () => {
    const { data } = transformValues(
      { user: { dob: "2024-01-15", active: true } },
      { transforms: { "user.dob": { type: "auto" }, "user.active": { type: "auto" } } }
    );
    expect(typeof (data as any).user.dob).toBe("string");
    expect((data as any).user.active).toBe("Yes");
  });
});

describe("transformValues — bare key transforms", () => {
  it("bare key matches at any depth", () => {
    const { data } = transformValues(
      { user: { active: true }, admin: { active: false } },
      { transforms: { active: { type: "boolean" } } }
    );
    expect((data as any).user.active).toBe("Yes");
    expect((data as any).admin.active).toBe("No");
  });
});

describe("transformValues — defaults", () => {
  it("applies defaults before transforms", () => {
    const { data, defaultedPaths } = transformValues(
      { user: { name: null, role: undefined } },
      { defaults: { "user.name": "Anonymous", "user.role": "viewer" } }
    );
    expect((data as any).user.name).toBe("Anonymous");
    expect((data as any).user.role).toBe("viewer");
    expect(defaultedPaths).toContain("user.name");
  });
});

describe("transformValues — computed fields", () => {
  it("injects computed field from root data", () => {
    const { data, computedPaths } = transformValues(
      { user: { firstName: "Alice", lastName: "Smith" } },
      {
        computed: {
          "user.fullName": (root) =>
            `${(root as any).user.firstName} ${(root as any).user.lastName}`,
        },
      }
    );
    expect((data as any).user.fullName).toBe("Alice Smith");
    expect(computedPaths).toContain("user.fullName");
  });

  it("computed field has access to transformed values", () => {
    const { data } = transformValues(
      { price: 1000, tax: 100 },
      {
        computed: {
          total: (root) => (root as any).price + (root as any).tax,
        },
      }
    );
    expect((data as any).total).toBe(1100);
  });
});

describe("transformValues — metadata", () => {
  it("tracks transformedPaths", () => {
    const { transformedPaths } = transformValues(
      { user: { name: "Alice", age: 30 } },
      { transforms: { "user.name": (v) => String(v).toUpperCase() } }
    );
    expect(transformedPaths).toContain("user.name");
    expect(transformedPaths).not.toContain("user.age");
  });

  it("returns frozen result", () => {
    const result = transformValues({ a: 1 }, {});
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not mutate input", () => {
    const input = { user: { dob: "2024-01-15" } };
    transformValues(input, {
      transforms: { "user.dob": { type: "date" } },
    });
    expect(input.user.dob).toBe("2024-01-15");
  });
});

describe("transformValues — arrays", () => {
  it("transforms values inside arrays with bare key", () => {
    const { data } = transformValues(
      { users: [{ active: true }, { active: false }] },
      { transforms: { active: { type: "boolean" } } }
    );
    expect((data as any).users[0].active).toBe("Yes");
    expect((data as any).users[1].active).toBe("No");
  });
});

describe("transformValues — security", () => {
  it("ignores __proto__ keys in input", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"safe":1}') as Record<string, unknown>;
    expect(() => transformValues(malicious, {})).not.toThrow();
    expect(Object.hasOwn({}, "x")).toBe(false);
  });
});

describe("transformValues — error resilience", () => {
  it("keeps original value when transformer throws", () => {
    const { data } = transformValues(
      { user: { name: "Alice" } },
      {
        transforms: {
          "user.name": () => {
            throw new Error("transform error");
          },
        },
      }
    );
    expect((data as any).user.name).toBe("Alice");
  });
});

// =============================================================================
// transformValuesDirect
// =============================================================================

describe("transformValuesDirect", () => {
  it("returns data directly without wrapper", () => {
    const result = transformValuesDirect(
      { user: { active: true } },
      { transforms: { "user.active": { type: "boolean" } } }
    );
    expect((result as any).user.active).toBe("Yes");
  });
});

// =============================================================================
// Full pipeline integration
// =============================================================================

describe("v0.4.0 + pipeline integration", () => {
  it("filter → transform pipeline", () => {
    const input = {
      customer: {
        firstName: "Alice",
        lastName: "Smith",
        dob: "1990-01-15",
        salary: 75000,
        active: true,
        password: "secret",
        status: "APPROVED",
      },
    };

    // Step 1: Filter sensitive fields
    const filtered = excludeKeysDirect(input, ["**.password"]);

    // Step 2: Transform values
    const { data } = transformValues(filtered, {
      transforms: {
        "customer.dob":    { type: "date", options: { format: "DD MMM YYYY" } },
        "customer.salary": { type: "currency", options: { currency: "USD" } },
        "customer.active": { type: "boolean", options: { trueLabel: "Active" } },
        "customer.status": {
          type: "enum",
          options: { map: { APPROVED: "Approved", PENDING: "Pending" } },
        },
      },
      computed: {
        "customer.fullName": (root) =>
          `${(root as any).customer.firstName} ${(root as any).customer.lastName}`,
      },
      defaults: { "customer.middleName": "N/A" },
    });

    expect((data as any).customer.password).toBeUndefined();
    expect((data as any).customer.dob).toBe("15 Jan 1990");
    expect((data as any).customer.salary).toContain("75,000");
    expect((data as any).customer.active).toBe("Active");
    expect((data as any).customer.status).toBe("Approved");
    expect((data as any).customer.fullName).toBe("Alice Smith");
    expect((data as any).customer.middleName).toBe("N/A");
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("value transformation — performance", () => {
  it("transforms 1000-item array within 300ms", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      dob: "1990-01-15",
      salary: 50000 + i,
      active: i % 2 === 0,
    }));

    const start = performance.now();
    const { data } = transformValues(
      { users: items },
      {
        transforms: {
          dob:    { type: "date" },
          salary: { type: "currency" },
          active: { type: "boolean" },
        },
      }
    );
    const duration = performance.now() - start;

    expect((data as any).users[0].dob).toBe("15 Jan 1990");
    expect(duration).toBeLessThan(300);
  });
});
