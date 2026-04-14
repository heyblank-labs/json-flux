// =============================================================================
// utils/string.ts
// Low-level string manipulation primitives used by the label layer.
//
// All functions are PURE — no side effects, no mutation.
// These are internal utilities; the public API lives in transform/label.ts.
// =============================================================================

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Splits a raw identifier into an array of raw tokens, handling:
 *  • camelCase          → ["user", "First", "Name"]
 *  • PascalCase         → ["User", "Profile"]
 *  • snake_case         → ["user", "first", "name"]
 *  • kebab-case         → ["user", "first", "name"]
 *  • dot.notation       → ["user", "first", "name"]
 *  • SCREAMING_SNAKE    → ["FIRST", "NAME"] → title-cased downstream
 *  • Mixed acronyms     → ["user", "ID", "Ref"]
 *  • Numbers embedded   → ["level", "2", "Cache"]
 *
 * @example
 * tokenize("firstName")       // ["first", "Name"]
 * tokenize("user_id")         // ["user", "id"]
 * tokenize("XMLParser")       // ["XML", "Parser"]
 * tokenize("getHTTPResponse") // ["get", "HTTP", "Response"]
 * tokenize("level2Cache")     // ["level", "2", "Cache"]
 */
export function tokenize(key: string): string[] {
  if (!key) return [];

  // Step 1: replace separators (underscore, hyphen, dot) with a space
  let s = key.replace(/[_\-. ]+/g, " ");

  // Step 2: insert space before uppercase following lowercase
  //   "firstName" → "first Name"
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Step 3: insert space between uppercase runs and trailing lowercase
  //   "XMLParser"       → "XML Parser"
  //   "getHTTPResponse" → "get HTTP Response"
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Step 4: split digits from surrounding letters
  //   "level2Cache" → "level 2 Cache"
  s = s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
  s = s.replace(/(\d)([a-zA-Z])/g, "$1 $2");

  // Step 5: split on whitespace, drop empty strings
  return s.split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Case transformation
// ---------------------------------------------------------------------------

/**
 * Title-cases a single word.
 * Preserves all-uppercase tokens only if they are 2+ chars (recognised as acronyms).
 * Single-char uppercase tokens and SCREAMING words from snake_case are title-cased.
 *
 * @example
 * titleWord("hello")  // "Hello"
 * titleWord("ID")     // "ID"   (2+ char acronym, preserved)
 * titleWord("FIRST")  // "First" (single word from SCREAMING_SNAKE, title-cased)
 */
/**
 * Title-cases a single word, optionally using a dictionary to preserve
 * known 4+ char acronyms (HTTP, IBAN, HTTPS, SWIFT).
 *
 * Rules:
 *  - 2–3 char all-caps → always preserved as acronym (ID, API, URL)
 *  - 4+ char all-caps  → preserved only if found in dictionary as itself
 *  - Mixed / lowercase → standard title-case
 */
export function titleWord(
  word: string,
  isDictAcronym = false
): string {
  if (!word) return "";
  if (word !== word.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  // All-caps: ≤3 chars always kept, 4+ only if confirmed by dictionary
  if (word.length <= 3) return word;
  if (isDictAcronym) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Applies title case to an array of tokens, joining with a space.
 * Uses an optional lookup function to identify 4+ char acronyms.
 *
 * @example
 * toTitleCase(["get", "HTTP", "Response"], t => t === "HTTP") // "Get HTTP Response"
 * toTitleCase(["first", "Name"])  // "First Name"
 */
export function toTitleCase(
  tokens: string[],
  isKnownAcronym?: (token: string) => boolean
): string {
  return tokens
    .map((t) => titleWord(t, isKnownAcronym ? isKnownAcronym(t) : false))
    .join(" ");
}

/**
 * Applies sentence case to tokens.
 * First token capitalised, rest lowercase except recognised acronyms.
 *
 * @example
 * toSentenceCase(["user", "HTTP", "endpoint"]) // "User HTTP endpoint"
 */
export function toSentenceCase(
  tokens: string[],
  isKnownAcronym?: (token: string) => boolean
): string {
  return tokens
    .map((token, i) => {
      const allCaps = token === token.toUpperCase() && token.length > 1;
      const isAcr = isKnownAcronym ? isKnownAcronym(token) : false;
      if (allCaps && (token.length <= 3 || isAcr)) return token; // preserve acronym
      if (i === 0) return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      return token.toLowerCase();
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Acronym handling
// ---------------------------------------------------------------------------

/**
 * Given a token, returns true if it looks like an acronym that should
 * be preserved as-is (all uppercase, 2+ characters).
 *
 * @example
 * looksLikeAcronym("ID")   // true
 * looksLikeAcronym("API")  // true
 * looksLikeAcronym("I")    // false  (single char)
 * looksLikeAcronym("Name") // false
 */
export function looksLikeAcronym(token: string): boolean {
  return token.length >= 2 && token === token.toUpperCase() && /^[A-Z]+\d*$/.test(token);
}

/**
 * Merges consecutive single-uppercase-char tokens into acronyms.
 * Handles edge cases like ["U", "S", "A"] → ["USA"].
 *
 * Only merges runs of single uppercase characters.
 */
export function mergeAcronymTokens(tokens: string[]): string[] {
  const result: string[] = [];
  let run = "";

  for (const token of tokens) {
    if (/^[A-Z]$/.test(token)) {
      run += token;
    } else {
      if (run) {
        result.push(run);
        run = "";
      }
      result.push(token);
    }
  }
  if (run) result.push(run);
  return result;
}

// ---------------------------------------------------------------------------
// Key sanitisation
// ---------------------------------------------------------------------------

/**
 * Strips bracket escaping added by the flatten layer: "[a.b]" → "a.b"
 *
 * @example
 * unescapeKey("[a.b]")  // "a.b"
 * unescapeKey("name")   // "name"
 */
export function unescapeKey(key: string): string {
  if (key.startsWith("[") && key.endsWith("]")) {
    return key.slice(1, -1);
  }
  return key;
}

/**
 * Extracts the last segment from a dot-notation path.
 *
 * @example
 * lastSegment("user.address.city") // "city"
 * lastSegment("name")              // "name"
 * lastSegment("")                  // ""
 */
export function lastSegment(path: string, delimiter = "."): string {
  if (!path) return "";
  const parts = path.split(delimiter);
  return parts[parts.length - 1] ?? "";
}
