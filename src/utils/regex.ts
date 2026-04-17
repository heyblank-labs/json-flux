// =============================================================================
// utils/regex.ts
// Pre-compiled regular expressions for PII detection.
// All patterns are module-level constants — compiled once, reused forever.
// =============================================================================

// ---------------------------------------------------------------------------
// Value-based patterns
// ---------------------------------------------------------------------------

/** RFC-5322 simplified email */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

/** Partial email match inside a larger string */
export const EMAIL_PARTIAL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/gi;

/** International phone — permissive heuristic */
export const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

/** Visa / MasterCard / Amex / Discover pattern (no spaces) */
export const CREDIT_CARD_RE = /^(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})$/;

/** US SSN: ###-##-#### */
export const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/;

/** IPv4 */
export const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

/** UUID v1-v5 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** JWT: three base64url segments separated by dots */
export const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Generic bearer / API token: 20+ alphanumeric chars */
export const TOKEN_RE = /^[A-Za-z0-9_\-/+]{20,}={0,2}$/;

// ---------------------------------------------------------------------------
// Key-name heuristics (case-insensitive match sets)
// ---------------------------------------------------------------------------

/** Key names that strongly indicate email fields */
export const EMAIL_KEY_HINTS = new Set([
  "email", "emailaddress", "email_address", "e-mail",
  "useremail", "contactemail", "primaryemail",
]);

/** Key names indicating phone number fields */
export const PHONE_KEY_HINTS = new Set([
  "phone", "phonenumber", "phone_number", "mobile",
  "mobilenumber", "cell", "cellphone", "telephone", "tel", "fax",
]);

/** Key names indicating password or credential fields */
export const PASSWORD_KEY_HINTS = new Set([
  "password", "passwd", "pass", "secret", "credential",
  "credentials", "passphrase", "pin", "hash", "encrypted",
]);

/** Key names indicating API tokens or keys */
export const TOKEN_KEY_HINTS = new Set([
  "token", "apikey", "api_key", "accesstoken", "access_token",
  "refreshtoken", "refresh_token", "authtoken", "auth_token",
  "bearertoken", "bearer", "jwt", "sessiontoken", "session_token",
  "privatekey", "private_key", "secretkey", "secret_key",
  "clientsecret", "client_secret",
]);

/** Key names indicating SSN or national ID */
export const SSN_KEY_HINTS = new Set([
  "ssn", "socialsecuritynumber", "social_security_number",
  "nationalid", "national_id", "taxid", "tax_id", "ein",
]);

/** Key names indicating credit card fields */
export const CREDIT_CARD_KEY_HINTS = new Set([
  "creditcard", "credit_card", "cardnumber", "card_number",
  "ccnumber", "cc", "pan", "cvv", "cvc", "expiry",
]);

/** Key names for IP addresses */
export const IP_KEY_HINTS = new Set([
  "ip", "ipaddress", "ip_address", "remoteip",
  "remote_ip", "clientip", "client_ip",
]);

/**
 * Normalises a key for hint lookup: strip separators, lowercase.
 * "apiKey" → "apikey", "API_KEY" → "apikey"
 */
export function normaliseKeyForHint(key: string): string {
  return key.replace(/[_\-. ]/g, "").toLowerCase();
}
