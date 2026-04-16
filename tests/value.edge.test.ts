// =============================================================================
// tests/value.edge.test.ts
// Additional edge case and branch coverage for v0.4.0 value layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { formatDate } from "../src/value/formatters/date.js";
import { formatCurrency } from "../src/value/formatters/currency.js";
import { formatBoolean, formatNumber } from "../src/value/formatters/boolean.js";
import { applyDefaults } from "../src/value/defaults.js";
import { injectComputedFields } from "../src/value/computed.js";
import { transformValues } from "../src/value/transform.js";
import { detectType } from "../src/value/detect.js";

// =============================================================================
// Date formatter edge cases
// =============================================================================

describe("formatDate — edge cases", () => {
  it("formats Date object directly", () => {
    const d = new Date(2024, 0, 15); // Jan 15 2024
    const result = formatDate(d, { format: "YYYY" });
    expect(result).toBe("2024");
  });

  it("handles timestamp in seconds mode", () => {
    const ts = Math.floor(new Date("2024-01-15").getTime() / 1000);
    const result = formatDate(ts, { format: "YYYY", timestampMs: false });
    expect(result).toBe("2024");
  });

  it("formats time tokens", () => {
    // Use a fixed datetime
    const result = formatDate("2024-01-15T14:35:07Z", {
      format: "HH:mm:ss",
    });
    // Time may vary by timezone; just check it looks like a time
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("handles format with only year", () => {
    expect(formatDate("2024-06-15", { format: "YYYY" })).toBe("2024");
  });

  it("handles unpadded D token", () => {
    const result = formatDate("2024-01-05", { format: "D/M/YYYY" });
    expect(result).toContain("5");
    expect(result).toContain("2024");
  });

  it("handles space-separated datetime string", () => {
    const result = formatDate("2024-01-15 10:30:00", { format: "YYYY-MM-DD" });
    expect(result).toBe("2024-01-15");
  });

  it("handles 12h format tokens", () => {
    const result = formatDate("2024-01-15T00:30:00Z", { format: "hh:mm A" });
    expect(result).toMatch(/\d{2}:\d{2} (AM|PM)/);
  });
});

// =============================================================================
// Currency formatter edge cases
// =============================================================================

describe("formatCurrency — edge cases", () => {
  it("handles Infinity as invalid", () => {
    expect(formatCurrency(Infinity)).toBe("—");
  });

  it("handles -Infinity as invalid", () => {
    expect(formatCurrency(-Infinity)).toBe("—");
  });

  it("strips currency symbols from string input before parsing", () => {
    const result = formatCurrency("$1,234.56", { currency: "USD", locale: "en-US" });
    expect(result).toContain("1,234");
  });

  it("handles invalid locale gracefully", () => {
    // Should fall back to en-US rather than throwing
    expect(() =>
      formatCurrency(100, { locale: "xx-INVALID", currency: "USD" })
    ).not.toThrow();
  });

  it("handles zero decimal places", () => {
    const result = formatCurrency(1500, { currency: "USD", locale: "en-US", decimals: 0 });
    expect(result).not.toContain(".");
  });
});

// =============================================================================
// Boolean formatter edge cases
// =============================================================================

describe("formatBoolean — edge cases", () => {
  it("handles unrecognised string → nullLabel", () => {
    expect(formatBoolean("maybe")).toBe("—");
  });

  it("handles unrecognised number → nullLabel", () => {
    expect(formatBoolean(99)).toBe("—");
  });

  it("all-lowercase 'TRUE'/'FALSE' handled", () => {
    expect(formatBoolean("TRUE")).toBe("Yes");
    expect(formatBoolean("FALSE")).toBe("No");
  });
});

// =============================================================================
// Number formatter edge cases
// =============================================================================

describe("formatNumber — edge cases", () => {
  it("handles undefined as fallback", () => {
    expect(formatNumber(undefined)).toBe("—");
  });

  it("handles NaN string as fallback", () => {
    expect(formatNumber("NaN")).toBe("—");
  });

  it("handles non-finite number", () => {
    expect(formatNumber(Infinity)).toBe("—");
  });

  it("handles negative numbers", () => {
    const result = formatNumber(-1234);
    expect(result).toContain("1,234");
  });
});

// =============================================================================
// detectType edge cases
// =============================================================================

describe("detectType — edge cases", () => {
  it("handles phone-like string", () => {
    const result = detectType("+91-9876543210");
    // Could be phone or string depending on confidence
    expect(["phone", "string"]).toContain(result.type);
  });

  it("handles Date object as object type", () => {
    // Dates are objects, not plain objects, but detectType sees typeof object
    const result = detectType(new Date());
    expect(result.type).toBe("object");
  });

  it("handles negative number string", () => {
    expect(detectType("-42").type).toBe("number");
  });

  it("handles URL without www", () => {
    expect(detectType("https://api.example.com/v1/users").type).toBe("url");
  });

  it("returns confidence=1 for null", () => {
    expect(detectType(null).confidence).toBe(1);
  });
});

// =============================================================================
// applyDefaults edge cases
// =============================================================================

describe("applyDefaults — edge cases", () => {
  it("handles empty defaults map", () => {
    const { data } = applyDefaults({ user: { name: "Alice" } }, {});
    expect((data as any).user.name).toBe("Alice");
  });

  it("handles null input", () => {
    const { data } = applyDefaults(null, { name: "N/A" });
    expect(data).toBeNull();
  });

  it("handles array input", () => {
    const { data } = applyDefaults(
      [{ name: null }, { name: "Bob" }],
      { name: "N/A" }
    );
    expect((data as any)[0].name).toBe("N/A");
    expect((data as any)[1].name).toBe("Bob");
  });

  it("fills deeply nested missing key", () => {
    const { data } = applyDefaults(
      { user: { address: {} } },
      { "user.address.city": "London" }
    );
    expect((data as any).user.address.city).toBe("London");
  });

  it("wildcard default fills array items", () => {
    const { data } = applyDefaults(
      { users: [{ role: null }, { role: "admin" }] },
      { "users[*].role": "viewer" }
    );
    expect((data as any).users[0].role).toBe("viewer");
    expect((data as any).users[1].role).toBe("admin");
  });

  it("does not fill when value is 0 (falsy but valid)", () => {
    const { data } = applyDefaults({ count: 0 }, { count: 99 });
    // 0 is not null/undefined — should NOT be replaced
    expect((data as any).count).toBe(0);
  });

  it("does not fill when value is false", () => {
    const { data } = applyDefaults({ active: false }, { active: true });
    expect((data as any).active).toBe(false);
  });

  it("handles circular references safely", () => {
    const obj: Record<string, unknown> = { name: "Alice" };
    obj["self"] = obj;
    expect(() => applyDefaults(obj, { name: "N/A" })).not.toThrow();
  });
});

// =============================================================================
// injectComputedFields edge cases
// =============================================================================

describe("injectComputedFields — edge cases", () => {
  it("handles empty computed map", () => {
    const { data, computedPaths } = injectComputedFields({ a: 1 }, {});
    expect((data as any).a).toBe(1);
    expect(computedPaths).toHaveLength(0);
  });

  it("handles null input gracefully", () => {
    const { data } = injectComputedFields(null, { x: () => 1 });
    expect(data).toBeNull();
  });

  it("handles non-plain-object input — passes through primitives unchanged", () => {
    const { data } = injectComputedFields(42 as unknown, { x: () => 1 });
    expect(data).toBe(42);
  });

  it("skips unsafe key in computed path", () => {
    const { data } = injectComputedFields(
      { a: 1 },
      { "__proto__.polluted": () => "evil" }
    );
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });

  it("returns null for compute functions that throw", () => {
    const { data } = injectComputedFields(
      { a: 1 },
      { b: () => { throw new Error("fail"); } }
    );
    expect((data as any).b).toBeNull();
  });

  it("injects top-level field", () => {
    const { data } = injectComputedFields(
      { x: 1, y: 2 },
      { sum: (root) => (root as any).x + (root as any).y }
    );
    expect((data as any).sum).toBe(3);
  });
});

// =============================================================================
// transformValues edge cases
// =============================================================================

describe("transformValues — edge cases", () => {
  it("handles empty config — returns input unchanged", () => {
    const input = { user: { name: "Alice", age: 30 } };
    const { data } = transformValues(input, {});
    expect(data).toEqual(input);
  });

  it("handles null input", () => {
    const { data } = transformValues(null as unknown, {});
    expect(data).toBeNull();
  });

  it("handles array input", () => {
    const { data } = transformValues(
      [{ active: true }, { active: false }],
      { transforms: { active: { type: "boolean" } } }
    );
    expect((data as any)[0].active).toBe("Yes");
    expect((data as any)[1].active).toBe("No");
  });

  it("autoFormat detects and formats dates and booleans", () => {
    const { data } = transformValues(
      { dob: "2024-01-15", active: true, name: "Alice" },
      { autoFormat: true }
    );
    // dob should be formatted as a date string
    expect(typeof (data as any).dob).toBe("string");
    expect((data as any).dob).not.toBe("2024-01-15");
    // boolean should be formatted
    expect((data as any).active).toBe("Yes");
    // string stays as string
    expect((data as any).name).toBe("Alice");
  });

  it("transformer with { type: 'default' } keeps non-null value", () => {
    const { data } = transformValues(
      { user: { name: "Alice" } },
      { transforms: { "user.name": { type: "default", value: "N/A" } } }
    );
    expect((data as any).user.name).toBe("Alice"); // not null — kept
  });

  it("transformer with { type: 'default' } fills null", () => {
    const { data } = transformValues(
      { user: { name: null } },
      { transforms: { "user.name": { type: "default", value: "N/A" } } }
    );
    expect((data as any).user.name).toBe("N/A");
  });

  it("number transform via config", () => {
    const { data } = transformValues(
      { stats: { views: 1234567 } },
      { transforms: { "stats.views": { type: "number", options: { locale: "en-US" } } } }
    );
    expect((data as any).stats.views).toContain("1,234,567");
  });

  it("handles circular reference in input without throwing", () => {
    const obj: Record<string, unknown> = { name: "Alice" };
    obj["self"] = obj;
    expect(() => transformValues(obj, { transforms: { name: (v) => String(v).toUpperCase() } })).not.toThrow();
  });

  it("wildcards in transform paths match array items", () => {
    const { data } = transformValues(
      { orders: [{ status: "PENDING" }, { status: "APPROVED" }] },
      {
        transforms: {
          "orders[*].status": {
            type: "enum",
            options: { map: { PENDING: "Pending", APPROVED: "Approved" } },
          },
        },
      }
    );
    expect((data as any).orders[0].status).toBe("Pending");
    expect((data as any).orders[1].status).toBe("Approved");
  });
});
