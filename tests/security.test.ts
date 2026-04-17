// =============================================================================
// tests/security.test.ts
// Full test suite for v0.6.0 — Masking & Security Layer
// =============================================================================

import { describe, it, expect } from "vitest";
import { detectPii, isSensitiveKey } from "../src/security/detect.js";
import { maskSensitive, maskSensitiveDirect, applyMask } from "../src/security/mask.js";
import { redactKeys, redactKeysDirect } from "../src/security/redact.js";
import { maskByPattern, maskByPatternDirect } from "../src/security/pattern.js";
import { safeClone, safeCloneDirect } from "../src/security/safeClone.js";
import { hashValue, hashValueSync } from "../src/utils/crypto.js";

// =============================================================================
// detectPii
// =============================================================================

describe("detectPii — key detection", () => {
  it("detects email key", () => {
    const r = detectPii("email", "alice@example.com");
    expect(r.isSensitive).toBe(true);
    expect(r.category).toBe("email");
    expect(r.detectedByKey).toBe(true);
  });

  it("detects password key", () => {
    const r = detectPii("password", "secret");
    expect(r.isSensitive).toBe(true);
    expect(r.category).toBe("password");
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it("detects token key variants", () => {
    expect(detectPii("apiKey", "abc").isSensitive).toBe(true);
    expect(detectPii("access_token", "xyz").isSensitive).toBe(true);
    expect(detectPii("jwt", "a.b.c").isSensitive).toBe(true);
  });

  it("detects phone key", () => {
    expect(detectPii("phone", "9876543210").isSensitive).toBe(true);
    expect(detectPii("mobile", "9876543210").isSensitive).toBe(true);
  });

  it("detects ssn key", () => {
    expect(detectPii("ssn", "123-45-6789").isSensitive).toBe(true);
  });

  it("detects creditCard key", () => {
    expect(detectPii("card_number", "4111111111111111").isSensitive).toBe(true);
  });

  it("does not flag safe key with safe value", () => {
    const r = detectPii("name", "Alice Smith");
    expect(r.isSensitive).toBe(false);
    expect(r.confidence).toBe(0);
  });
});

describe("detectPii — value detection", () => {
  it("detects email in value", () => {
    const r = detectPii("contact", "alice@example.com");
    expect(r.isSensitive).toBe(true);
    expect(r.category).toBe("email");
    expect(r.detectedByValue).toBe(true);
    expect(r.detectedByKey).toBe(false);
  });

  it("detects UUID in value", () => {
    const r = detectPii("ref", "550e8400-e29b-41d4-a716-446655440000");
    expect(r.isSensitive).toBe(true);
    expect(r.category).toBe("uuid");
  });

  it("detects SSN pattern", () => {
    expect(detectPii("data", "123-45-6789").isSensitive).toBe(true);
    expect(detectPii("data", "123-45-6789").category).toBe("ssn");
  });

  it("detects IPv4 in value", () => {
    expect(detectPii("source", "192.168.1.100").isSensitive).toBe(true);
    expect(detectPii("source", "192.168.1.100").category).toBe("ipAddress");
  });

  it("boosts confidence when both key and value match", () => {
    const keyOnly = detectPii("email", "not-an-email");
    const both    = detectPii("email", "alice@example.com");
    expect(both.confidence).toBeGreaterThan(keyOnly.confidence);
  });

  it("returns non-sensitive for plain text value", () => {
    const r = detectPii("description", "This is a normal description.");
    expect(r.isSensitive).toBe(false);
  });
});

describe("isSensitiveKey", () => {
  it("returns true for known PII keys", () => {
    expect(isSensitiveKey("email")).toBe(true);
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("phone")).toBe(true);
    expect(isSensitiveKey("ssn")).toBe(true);
  });

  it("returns false for safe keys", () => {
    expect(isSensitiveKey("name")).toBe(false);
    expect(isSensitiveKey("age")).toBe(false);
    expect(isSensitiveKey("status")).toBe(false);
  });

  it("is case-insensitive (normalises)", () => {
    expect(isSensitiveKey("EMAIL")).toBe(true);
    expect(isSensitiveKey("API_KEY")).toBe(true);
    expect(isSensitiveKey("PhoneNumber")).toBe(true);
  });
});

// =============================================================================
// applyMask
// =============================================================================

describe("applyMask — full mode", () => {
  it("replaces with maskChar repeated", () => {
    const result = applyMask("hello", "full", "*");
    expect(result).toMatch(/^\*+$/);
  });

  it("caps at 8 chars for long values", () => {
    expect(applyMask("a".repeat(20), "full", "*").length).toBe(8);
  });

  it("handles empty string", () => {
    expect(applyMask("", "full", "*")).toBe("");
  });
});

describe("applyMask — partial mode", () => {
  it("masks email — keeps first char and domain", () => {
    const result = applyMask("alice@example.com", "partial", "*");
    expect(result).toMatch(/^a\*+@example\.com$/);
  });

  it("masks phone — keeps last 4 digits", () => {
    const result = applyMask("+91-9876543210", "partial", "*");
    expect(result).toContain("3210");
    expect(result).toContain("*");
  });

  it("masks generic string — keeps first and last char", () => {
    const result = applyMask("secret123", "partial", "*");
    expect(result.charAt(0)).toBe("s");
    expect(result.charAt(result.length - 1)).toBe("3");
    expect(result).toContain("*");
  });

  it("short values get fixed-length mask", () => {
    const result = applyMask("ab", "partial", "*");
    expect(result).toBe("****");
  });
});

describe("applyMask — hash mode", () => {
  it("returns a hex string", () => {
    const result = applyMask("test", "hash", "*");
    expect(result).toMatch(/^[0-9a-f]+$/i);
  });

  it("same input → same hash (deterministic)", () => {
    const a = applyMask("test", "hash", "*");
    const b = applyMask("test", "hash", "*");
    expect(a).toBe(b);
  });

  it("different inputs → different hashes", () => {
    expect(applyMask("alice", "hash", "*")).not.toBe(applyMask("bob", "hash", "*"));
  });
});

describe("applyMask — custom mode", () => {
  it("calls custom function", () => {
    const result = applyMask("9876543210", "custom", "*", (v) => `***${v.slice(-4)}`);
    expect(result).toBe("***3210");
  });

  it("falls back to full mask when customFn throws", () => {
    const result = applyMask("test", "custom", "*", () => { throw new Error(); });
    expect(result).toMatch(/^\*+$/);
  });

  it("falls back when no customFn provided", () => {
    const result = applyMask("test", "custom", "*");
    expect(result).toMatch(/^\*+$/);
  });
});

// =============================================================================
// maskSensitive
// =============================================================================

describe("maskSensitive — explicit fields", () => {
  it("masks a top-level field", () => {
    const { data } = maskSensitive(
      { email: "alice@example.com", name: "Alice" },
      { fields: ["email"], mode: "full" }
    );
    expect((data as any).email).toMatch(/^\*+$/);
    expect((data as any).name).toBe("Alice");
  });

  it("masks a nested field by dot path", () => {
    const { data } = maskSensitive(
      { user: { email: "alice@example.com", name: "Alice" } },
      { fields: ["user.email"], mode: "partial" }
    );
    expect((data as any).user.email).toMatch(/^a\*+@/);
    expect((data as any).user.name).toBe("Alice");
  });

  it("masks with wildcard pattern", () => {
    const { data } = maskSensitive(
      { user: { password: "s1" }, admin: { password: "s2" } },
      { fields: ["**.password"], mode: "full" }
    );
    expect((data as any).user.password).toMatch(/^\*+$/);
    expect((data as any).admin.password).toMatch(/^\*+$/);
  });

  it("masks bare key at any depth", () => {
    const { data } = maskSensitive(
      { a: { token: "abc123" }, b: { token: "xyz789" } },
      { fields: ["token"], mode: "full" }
    );
    expect((data as any).a.token).toMatch(/^\*+$/);
    expect((data as any).b.token).toMatch(/^\*+$/);
  });

  it("masks array items with [*] pattern", () => {
    const { data } = maskSensitive(
      { users: [{ email: "a@b.com" }, { email: "c@d.com" }] },
      { fields: ["users[*].email"], mode: "full" }
    );
    expect((data as any).users[0].email).toMatch(/^\*+$/);
    expect((data as any).users[1].email).toMatch(/^\*+$/);
  });

  it("tracks maskedCount", () => {
    const { maskedCount } = maskSensitive(
      { a: "v1", b: "v2", c: "v3" },
      { fields: ["a", "c"] }
    );
    expect(maskedCount).toBe(2);
  });

  it("returns audit trail when audit: true", () => {
    const { auditTrail } = maskSensitive(
      { user: { email: "a@b.com" } },
      { fields: ["user.email"], mode: "partial", audit: true }
    );
    expect(auditTrail).toHaveLength(1);
    expect(auditTrail[0]?.path).toBe("user.email");
    expect(auditTrail[0]?.action).toBe("masked");
    expect(auditTrail[0]?.mode).toBe("partial");
  });

  it("does not mutate input", () => {
    const input = { user: { email: "alice@example.com" } };
    maskSensitive(input, { fields: ["user.email"] });
    expect(input.user.email).toBe("alice@example.com");
  });

  it("returns frozen result", () => {
    const result = maskSensitive({ a: "v" }, { fields: ["a"] });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("maskSensitive — autoDetect", () => {
  it("auto-detects email fields", () => {
    const { data, maskedCount } = maskSensitive(
      { email: "alice@example.com", name: "Alice", age: 30 },
      { autoDetect: true, mode: "full" }
    );
    expect((data as any).email).toMatch(/^\*+$/);
    expect((data as any).name).toBe("Alice");
    expect((data as any).age).toBe(30);
    expect(maskedCount).toBeGreaterThan(0);
  });

  it("auto-detects password fields", () => {
    const { data } = maskSensitive(
      { user: { name: "Alice", password: "s3cr3t" } },
      { autoDetect: true, mode: "full" }
    );
    expect((data as any).user.password).toMatch(/^\*+$/);
    expect((data as any).user.name).toBe("Alice");
  });

  it("respects autoDetectThreshold", () => {
    // Phone key with a value that barely triggers phone detection
    const { maskedCount: lowThresh } = maskSensitive(
      { contact: "9876543210" },
      { autoDetect: true, autoDetectThreshold: 0.5 }
    );
    const { maskedCount: highThresh } = maskSensitive(
      { contact: "9876543210" },
      { autoDetect: true, autoDetectThreshold: 0.99 }
    );
    // Low threshold should mask more than high threshold
    expect(lowThresh).toBeGreaterThanOrEqual(highThresh);
  });

  it("skips non-sensitive fields", () => {
    const { data } = maskSensitive(
      { status: "active", count: 42 },
      { autoDetect: true }
    );
    expect((data as any).status).toBe("active");
    expect((data as any).count).toBe(42);
  });
});

describe("maskSensitiveDirect", () => {
  it("returns data directly", () => {
    const result = maskSensitiveDirect({ secret: "abc" }, { fields: ["secret"] });
    expect((result as any).secret).toMatch(/^\*+$/);
  });
});

// =============================================================================
// redactKeys
// =============================================================================

describe("redactKeys", () => {
  it("removes specified keys entirely", () => {
    const { data } = redactKeys(
      { user: { name: "Alice", password: "secret" } },
      ["user.password"]
    );
    expect((data as any).user.password).toBeUndefined();
    expect((data as any).user.name).toBe("Alice");
  });

  it("removes with wildcard pattern", () => {
    const { data } = redactKeys(
      { u1: { token: "a" }, u2: { token: "b" } },
      ["**.token"]
    );
    expect((data as any).u1.token).toBeUndefined();
    expect((data as any).u2.token).toBeUndefined();
  });

  it("removes from arrays with [*] pattern", () => {
    const { data } = redactKeys(
      { users: [{ name: "Alice", ssn: "123-45-6789" }] },
      ["users[*].ssn"]
    );
    expect((data as any).users[0].ssn).toBeUndefined();
    expect((data as any).users[0].name).toBe("Alice");
  });

  it("auto-detects and redacts PII", () => {
    const { data, maskedCount } = redactKeys(
      { email: "alice@example.com", name: "Alice", password: "secret" },
      [],
      { autoDetect: true }
    );
    expect((data as any).email).toBeUndefined();
    expect((data as any).password).toBeUndefined();
    expect((data as any).name).toBe("Alice");
    expect(maskedCount).toBeGreaterThan(0);
  });

  it("populates audit trail", () => {
    const { auditTrail } = redactKeys(
      { user: { password: "x" } },
      ["user.password"],
      { audit: true }
    );
    expect(auditTrail[0]?.action).toBe("redacted");
    expect(auditTrail[0]?.path).toBe("user.password");
  });

  it("does not mutate input", () => {
    const input = { a: 1, b: 2 };
    redactKeys(input, ["a"]);
    expect(input.a).toBe(1);
  });
});

describe("redactKeysDirect", () => {
  it("returns data directly", () => {
    const result = redactKeysDirect({ pass: "x", name: "Alice" }, ["pass"]);
    expect((result as any).pass).toBeUndefined();
    expect((result as any).name).toBe("Alice");
  });
});

// =============================================================================
// maskByPattern
// =============================================================================

describe("maskByPattern", () => {
  it("masks entire field when pattern matches", () => {
    const { data } = maskByPattern(
      { contact: "alice@example.com", name: "Alice" },
      { patterns: { email: /[^\s@]+@[^\s@]+\.[^\s@]+/i }, mode: "full" }
    );
    expect((data as any).contact).toMatch(/^\*+$/);
    expect((data as any).name).toBe("Alice");
  });

  it("masks only matching portion with maskMatchOnly: true", () => {
    const { data } = maskByPattern(
      { notes: "Contact alice@example.com for info" },
      { patterns: { email: /[^\s@]+@[^\s@]+\.[^\s@]+/gi }, mode: "full", maskMatchOnly: true }
    );
    expect((data as any).notes).toContain("Contact");
    expect((data as any).notes).toContain("for info");
    expect((data as any).notes).not.toContain("alice@example.com");
  });

  it("tracks maskedCount", () => {
    const { maskedCount } = maskByPattern(
      { a: "alice@test.com", b: "bob@test.com", c: "not-email" },
      { patterns: { email: /[^\s@]+@[^\s@]+\.[^\s@]+/i } }
    );
    expect(maskedCount).toBe(2);
  });

  it("populates audit trail", () => {
    const { auditTrail } = maskByPattern(
      { email: "alice@test.com" },
      { patterns: { email: /[^\s@]+@[^\s@]+\.[^\s@]+/i }, audit: true }
    );
    expect(auditTrail[0]?.action).toBe("masked");
  });

  it("handles multiple patterns", () => {
    const { maskedCount } = maskByPattern(
      { email: "alice@test.com", phone: "9876543210" },
      {
        patterns: {
          email: /[^\s@]+@[^\s@]+\.[^\s@]+/i,
          phone: /\d{10}/,
        },
      }
    );
    expect(maskedCount).toBe(2);
  });

  it("does not mutate input", () => {
    const input = { email: "a@b.com" };
    maskByPattern(input, { patterns: { e: /a@b\.com/i } });
    expect(input.email).toBe("a@b.com");
  });
});

describe("maskByPatternDirect", () => {
  it("returns data directly", () => {
    const result = maskByPatternDirect(
      { email: "a@b.com" },
      { patterns: { e: /[^\s@]+@[^\s@]+\.[^\s@]+/i }, mode: "full" }
    );
    expect((result as any).email).toMatch(/^\*+$/);
  });
});

// =============================================================================
// safeClone
// =============================================================================

describe("safeClone", () => {
  it("masks specified fields in clone", () => {
    const { data } = safeClone(
      { user: { email: "alice@example.com", name: "Alice" } },
      { maskFields: ["user.email"], mode: "partial" }
    );
    expect((data as any).user.email).toMatch(/^a\*+@/);
    expect((data as any).user.name).toBe("Alice");
  });

  it("redacts specified fields in clone", () => {
    const { data } = safeClone(
      { user: { name: "Alice", password: "secret" } },
      { redactFields: ["user.password"] }
    );
    expect((data as any).user.password).toBeUndefined();
    expect((data as any).user.name).toBe("Alice");
  });

  it("applies both mask and redact", () => {
    const { data, maskedCount } = safeClone(
      { user: { email: "a@b.com", password: "secret", name: "Alice" } },
      { maskFields: ["user.email"], redactFields: ["user.password"] }
    );
    expect((data as any).user.email).toMatch(/^\*+$|^a\*+@/);
    expect((data as any).user.password).toBeUndefined();
    expect((data as any).user.name).toBe("Alice");
    expect(maskedCount).toBe(2);
  });

  it("combines audit trails from mask and redact", () => {
    const { auditTrail } = safeClone(
      { email: "a@b.com", password: "x" },
      { maskFields: ["email"], redactFields: ["password"] }
    );
    const actions = auditTrail.map((e) => e.action);
    expect(actions).toContain("masked");
    expect(actions).toContain("redacted");
  });

  it("auto-detects PII when autoDetect: true", () => {
    const { data } = safeClone(
      { email: "alice@example.com", name: "Alice", password: "secret" },
      { autoDetect: true }
    );
    // auto-detect should mask email and password
    expect((data as any).email).not.toBe("alice@example.com");
    expect((data as any).name).toBe("Alice");
  });

  it("does not mutate original", () => {
    const input = { user: { email: "a@b.com", name: "Alice" } };
    safeClone(input, { maskFields: ["user.email"] });
    expect(input.user.email).toBe("a@b.com");
  });
});

describe("safeCloneDirect", () => {
  it("returns data directly", () => {
    const result = safeCloneDirect(
      { secret: "abc", name: "Alice" },
      { redactFields: ["secret"] }
    );
    expect((result as any).secret).toBeUndefined();
    expect((result as any).name).toBe("Alice");
  });
});

// =============================================================================
// Hashing utilities
// =============================================================================

describe("hashValueSync", () => {
  it("returns a non-empty hex string", () => {
    const h = hashValueSync("test");
    expect(h).toMatch(/^[0-9a-f]+$/);
    expect(h.length).toBeGreaterThan(0);
  });

  it("same input → same output", () => {
    expect(hashValueSync("alice")).toBe(hashValueSync("alice"));
  });

  it("different inputs → different outputs", () => {
    expect(hashValueSync("alice")).not.toBe(hashValueSync("bob"));
  });

  it("respects length parameter", () => {
    const h = hashValueSync("test", 8);
    expect(h.length).toBeLessThanOrEqual(8);
  });
});

describe("hashValue (async)", () => {
  it("returns a non-empty hex string", async () => {
    const h = await hashValue("test");
    expect(h).toMatch(/^[0-9a-f]+$/i);
    expect(h.length).toBeGreaterThan(0);
  });

  it("same input → same hash", async () => {
    const a = await hashValue("alice");
    const b = await hashValue("alice");
    expect(a).toBe(b);
  });

  it("different inputs → different hashes", async () => {
    const a = await hashValue("alice");
    const b = await hashValue("bob");
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// Security: prototype pollution resistance
// =============================================================================

describe("security layer — prototype pollution resistance", () => {
  it("maskSensitive never pollutes Object.prototype", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"email":"a@b.com"}') as Record<string, unknown>;
    maskSensitive(malicious, { fields: ["email"] });
    expect(Object.hasOwn({}, "x")).toBe(false);
  });

  it("redactKeys never pollutes Object.prototype", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"name":"Alice"}') as Record<string, unknown>;
    redactKeys(malicious, ["name"]);
    expect(Object.hasOwn({}, "x")).toBe(false);
  });

  it("maskByPattern never pollutes Object.prototype", () => {
    const malicious = JSON.parse('{"__proto__":{"x":1},"email":"a@b.com"}') as Record<string, unknown>;
    maskByPattern(malicious, { patterns: { e: /a@b\.com/ } });
    expect(Object.hasOwn({}, "x")).toBe(false);
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("security — performance", () => {
  it("maskSensitive handles 1000-user array within 300ms", () => {
    const users = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      email: `user${i}@test.com`,
      password: `pass${i}`,
      name: `User ${i}`,
    }));
    const start = performance.now();
    maskSensitive({ users }, { fields: ["**.email", "**.password"], mode: "full" });
    expect(performance.now() - start).toBeLessThan(300);
  });

  it("autoDetect on 500-field object within 200ms", () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < 500; i++) obj[`field${i}`] = `value${i}`;
    obj["email"] = "alice@test.com";
    obj["password"] = "secret";
    const start = performance.now();
    maskSensitive(obj, { autoDetect: true });
    expect(performance.now() - start).toBeLessThan(200);
  });
});
