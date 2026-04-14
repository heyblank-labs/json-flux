// =============================================================================
// tests/label.test.ts
// Tests for toDisplayLabel, labelKeys, clearLabelCache, and string utilities
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { toDisplayLabel, labelKeys, clearLabelCache } from "../src/transform/label.js";
import { tokenize, toTitleCase, toSentenceCase, mergeAcronymTokens, looksLikeAcronym, lastSegment, unescapeKey } from "../src/utils/string.js";
import { lookupDictionary, isAcronym, BUILT_IN_DICTIONARY } from "../src/utils/dictionary.js";

beforeEach(() => clearLabelCache());

// ── toDisplayLabel — camelCase ──────────────────────────────────────────────

describe("toDisplayLabel — camelCase", () => {
  it("converts camelCase to Title Case", () => {
    expect(toDisplayLabel("firstName")).toBe("First Name");
  });

  it("converts multi-word camelCase", () => {
    expect(toDisplayLabel("userFirstName")).toBe("User First Name");
  });

  it("handles PascalCase", () => {
    expect(toDisplayLabel("UserProfile")).toBe("User Profile");
  });

  it("handles single word", () => {
    expect(toDisplayLabel("name")).toBe("Name");
  });

  it("handles already Title Case (no change needed)", () => {
    expect(toDisplayLabel("Name")).toBe("Name");
  });
});

// ── toDisplayLabel — snake_case / kebab-case ────────────────────────────────

describe("toDisplayLabel — separators", () => {
  it("converts snake_case", () => {
    expect(toDisplayLabel("first_name")).toBe("First Name");
  });

  it("converts SCREAMING_SNAKE_CASE", () => {
    expect(toDisplayLabel("FIRST_NAME")).toBe("First Name");
  });

  it("converts kebab-case", () => {
    expect(toDisplayLabel("first-name")).toBe("First Name");
  });

  it("converts dot.notation", () => {
    expect(toDisplayLabel("first.name")).toBe("Name"); // last segment only
  });

  it("handles mixed separators", () => {
    expect(toDisplayLabel("user_firstName")).toBe("User First Name");
  });
});

// ── toDisplayLabel — acronym handling ──────────────────────────────────────

describe("toDisplayLabel — acronyms", () => {
  it("preserves ID acronym from dictionary", () => {
    expect(toDisplayLabel("id")).toBe("ID");
  });

  it("preserves API acronym from dictionary", () => {
    expect(toDisplayLabel("api")).toBe("API");
  });

  it("preserves acronym in camelCase: userID", () => {
    expect(toDisplayLabel("userID")).toBe("User ID");
  });

  it("preserves acronym: XMLParser", () => {
    expect(toDisplayLabel("XMLParser")).toBe("XML Parser");
  });

  it("preserves acronym: getHTTPResponse", () => {
    expect(toDisplayLabel("getHTTPResponse")).toBe("Get HTTP Response");
  });

  it("preserves dob via dictionary → Date of Birth", () => {
    expect(toDisplayLabel("dob")).toBe("Date of Birth");
  });

  it("preserves ssn via dictionary → SSN", () => {
    expect(toDisplayLabel("ssn")).toBe("SSN");
  });

  it("degrades acronyms when preserveAcronyms = false", () => {
    // With preserveAcronyms: false, "ID" becomes "Id", "API" becomes "Api"
    const result = toDisplayLabel("userID", { preserveAcronyms: false });
    expect(result).toBe("User Id");
  });
});

// ── toDisplayLabel — dot-notation path ──────────────────────────────────────

describe("toDisplayLabel — path handling", () => {
  it("uses only last segment of dot path", () => {
    expect(toDisplayLabel("user.firstName")).toBe("First Name");
  });

  it("uses only last segment of deep path", () => {
    expect(toDisplayLabel("user.address.city")).toBe("City");
  });

  it("works with custom delimiter", () => {
    expect(toDisplayLabel("user>address>city", { delimiter: ">" })).toBe("City");
  });

  it("returns empty string for empty key", () => {
    expect(toDisplayLabel("")).toBe("");
  });

  it("returns empty string for unsafe key __proto__", () => {
    expect(toDisplayLabel("__proto__")).toBe("");
  });

  it("returns empty string for unsafe key constructor", () => {
    expect(toDisplayLabel("constructor")).toBe("");
  });
});

// ── toDisplayLabel — case styles ────────────────────────────────────────────

describe("toDisplayLabel — caseStyle", () => {
  it("defaults to title case", () => {
    expect(toDisplayLabel("userFirstName")).toBe("User First Name");
  });

  it("applies sentence case", () => {
    const result = toDisplayLabel("userFirstName", { caseStyle: "sentence" });
    expect(result).toBe("User first name");
  });

  it("sentence case preserves acronyms", () => {
    const result = toDisplayLabel("userID", { caseStyle: "sentence" });
    expect(result).toBe("User ID");
  });
});

// ── toDisplayLabel — custom dictionary ──────────────────────────────────────

describe("toDisplayLabel — custom dictionary overrides", () => {
  it("uses custom dictionary over built-in", () => {
    expect(
      toDisplayLabel("firstName", { dictionary: { firstName: "Given Name" } })
    ).toBe("Given Name");
  });

  it("custom dictionary match is case-insensitive", () => {
    expect(
      toDisplayLabel("FIRSTNAME", { dictionary: { firstname: "Given Name" } })
    ).toBe("Given Name");
  });

  it("falls back to auto-label when key not in dictionary", () => {
    expect(
      toDisplayLabel("lastName", { dictionary: { firstName: "Given Name" } })
    ).toBe("Last Name");
  });

  it("custom dictionary overrides built-in dictionary", () => {
    // Built-in maps "dob" → "Date of Birth"; custom should win
    expect(
      toDisplayLabel("dob", { dictionary: { dob: "Birthday" } })
    ).toBe("Birthday");
  });
});

// ── toDisplayLabel — memoization ────────────────────────────────────────────

describe("toDisplayLabel — memoization", () => {
  it("returns same result on repeated calls", () => {
    const a = toDisplayLabel("firstName");
    const b = toDisplayLabel("firstName");
    expect(a).toBe(b);
  });

  it("cache is cleared by clearLabelCache", () => {
    toDisplayLabel("firstName");
    clearLabelCache();
    // After clear, should still return correct result (recomputed)
    expect(toDisplayLabel("firstName")).toBe("First Name");
  });

  it("different options produce different cached results", () => {
    const title = toDisplayLabel("firstName", { caseStyle: "title" });
    const sentence = toDisplayLabel("firstName", { caseStyle: "sentence" });
    expect(title).not.toBe(sentence);
  });
});

// ── labelKeys ───────────────────────────────────────────────────────────────

describe("labelKeys", () => {
  it("maps an array of keys to their labels", () => {
    const result = labelKeys(["firstName", "user_id", "dob"]);
    expect(result["firstName"]).toBe("First Name");
    expect(result["user_id"]).toBe("User ID");
    expect(result["dob"]).toBe("Date of Birth");
  });

  it("returns a frozen object", () => {
    const result = labelKeys(["name"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("handles empty array", () => {
    const result = labelKeys([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("applies shared options to all keys", () => {
    const result = labelKeys(["firstName", "lastName"], { caseStyle: "sentence" });
    expect(result["firstName"]).toBe("First name");
    expect(result["lastName"]).toBe("Last name");
  });
});

// ── String utilities ────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("splits camelCase", () => expect(tokenize("firstName")).toEqual(["first", "Name"]));
  it("splits PascalCase", () => expect(tokenize("UserProfile")).toEqual(["User", "Profile"]));
  it("splits snake_case", () => expect(tokenize("first_name")).toEqual(["first", "name"]));
  it("splits kebab-case", () => expect(tokenize("first-name")).toEqual(["first", "name"]));
  it("splits mixed case with acronym", () => expect(tokenize("XMLParser")).toEqual(["XML", "Parser"]));
  it("splits getHTTPResponse", () => expect(tokenize("getHTTPResponse")).toEqual(["get", "HTTP", "Response"]));
  it("handles number embedded", () => expect(tokenize("level2Cache")).toEqual(["level", "2", "Cache"]));
  it("returns empty for empty string", () => expect(tokenize("")).toEqual([]));
});

describe("toTitleCase", () => {
  it("title-cases tokens", () => expect(toTitleCase(["first", "name"])).toBe("First Name"));
  it("preserves all-caps tokens (acronyms)", () => expect(toTitleCase(["user", "ID"])).toBe("User ID"));
});

describe("toSentenceCase", () => {
  it("capitalises only first token", () => expect(toSentenceCase(["first", "name"])).toBe("First name"));
  it("preserves acronyms mid-sentence", () => expect(toSentenceCase(["user", "ID"])).toBe("User ID"));
  it("handles single token", () => expect(toSentenceCase(["status"])).toBe("Status"));
});

describe("mergeAcronymTokens", () => {
  it("merges single-char uppercase runs", () => {
    expect(mergeAcronymTokens(["U", "S", "A"])).toEqual(["USA"]);
  });
  it("leaves normal tokens unchanged", () => {
    expect(mergeAcronymTokens(["User", "ID"])).toEqual(["User", "ID"]);
  });
  it("handles mixed run + word", () => {
    expect(mergeAcronymTokens(["U", "S", "address"])).toEqual(["US", "address"]);
  });
});

describe("looksLikeAcronym", () => {
  it("returns true for 2+ uppercase chars", () => expect(looksLikeAcronym("ID")).toBe(true));
  it("returns true for API", () => expect(looksLikeAcronym("API")).toBe(true));
  it("returns false for single char", () => expect(looksLikeAcronym("I")).toBe(false));
  it("returns false for mixed case", () => expect(looksLikeAcronym("Name")).toBe(false));
});

describe("lastSegment", () => {
  it("returns last segment of dot path", () => expect(lastSegment("a.b.c")).toBe("c"));
  it("returns whole string if no delimiter", () => expect(lastSegment("name")).toBe("name"));
  it("returns empty for empty string", () => expect(lastSegment("")).toBe(""));
  it("respects custom delimiter", () => expect(lastSegment("a>b>c", ">")).toBe("c"));
});

describe("unescapeKey", () => {
  it("removes bracket escaping", () => expect(unescapeKey("[a.b]")).toBe("a.b"));
  it("leaves normal keys unchanged", () => expect(unescapeKey("name")).toBe("name"));
  it("handles empty brackets", () => expect(unescapeKey("[]")).toBe(""));
});

// ── Dictionary utilities ─────────────────────────────────────────────────────

describe("lookupDictionary", () => {
  it("finds built-in entry", () => expect(lookupDictionary("id")).toBe("ID"));
  it("lookup is case-insensitive", () => expect(lookupDictionary("ID")).toBe("ID"));
  it("returns undefined for unknown key", () => expect(lookupDictionary("xyz123")).toBeUndefined());
  it("custom dictionary takes priority over built-in", () => {
    expect(lookupDictionary("id", { id: "Identifier" })).toBe("Identifier");
  });
  it("custom lookup is case-insensitive", () => {
    expect(lookupDictionary("DOB", { dob: "Birthday" })).toBe("Birthday");
  });
});

describe("isAcronym", () => {
  it("returns true for 2-char uppercase", () => expect(isAcronym("ID")).toBe(true));
  it("returns true for 3-char uppercase", () => expect(isAcronym("API")).toBe(true));
  it("returns true for uppercase + digit", () => expect(isAcronym("IPv4")).toBe(true));
  it("returns false for mixed case", () => expect(isAcronym("Name")).toBe(false));
  it("returns false for single char", () => expect(isAcronym("I")).toBe(false));
});

describe("BUILT_IN_DICTIONARY", () => {
  it("is frozen", () => expect(Object.isFrozen(BUILT_IN_DICTIONARY)).toBe(true));
  it("contains expected entries", () => {
    expect(BUILT_IN_DICTIONARY["dob"]).toBe("Date of Birth");
    expect(BUILT_IN_DICTIONARY["api"]).toBe("API");
    expect(BUILT_IN_DICTIONARY["jwt"]).toBe("JWT");
  });
  it("has no duplicate keys (integrity check)", () => {
    const keys = Object.keys(BUILT_IN_DICTIONARY);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
