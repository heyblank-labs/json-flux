// =============================================================================
// utils/dictionary.ts
// Built-in abbreviation dictionary for common keys found in enterprise APIs.
//
// Priority order in label resolution:
//   1. User-supplied `labels` / `dictionary` overrides  (exact key match)
//   2. This built-in dictionary                         (lowercase key match)
//   3. Automatic camelCase / snake_case splitting
//
// All keys stored lowercase — matching is always case-insensitive.
// =============================================================================

/**
 * Default abbreviation → expanded label dictionary.
 * Covers common fields in enterprise, HR, medical, and financial APIs.
 *
 * Keys are lowercase. Values are the final display strings.
 */
export const BUILT_IN_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
  // Identity & personal
  id: "ID",
  uid: "UID",
  uuid: "UUID",
  dob: "Date of Birth",
  ssn: "SSN",
  ein: "EIN",
  tin: "TIN",

  // Contact
  email: "Email",
  phone: "Phone",
  mobile: "Mobile",
  fax: "Fax",
  url: "URL",
  uri: "URI",

  // Address
  addr: "Address",
  zip: "ZIP Code",
  zipcode: "ZIP Code",
  postcode: "Post Code",
  pobox: "PO Box",
  po: "Purchase Order",

  // Dates & times
  doa: "Date of Admission",
  dod: "Date of Discharge",
  eta: "ETA",
  etd: "ETD",
  eod: "End of Day",

  // Technical
  api: "API",
  sdk: "SDK",
  http: "HTTP",
  https: "HTTPS",
  ftp: "FTP",
  ip: "IP",
  ipv4: "IPv4",
  ipv6: "IPv6",
  mac: "MAC Address",
  cpu: "CPU",
  gpu: "GPU",
  ram: "RAM",
  sso: "SSO",
  oauth: "OAuth",
  jwt: "JWT",
  mfa: "MFA",
  otp: "OTP",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  xml: "XML",
  rest: "REST",
  soap: "SOAP",
  grpc: "gRPC",
  smtp: "SMTP",
  imap: "IMAP",

  // Business / HR
  hr: "HR",
  crm: "CRM",
  erp: "ERP",
  kpi: "KPI",
  roi: "ROI",
  sku: "SKU",
});

/**
 * Looks up a key in the built-in dictionary (case-insensitive).
 * Returns the expanded label or undefined if not found.
 */
export function lookupDictionary(
  key: string,
  custom?: Readonly<Record<string, string>>
): string | undefined {
  const lower = key.toLowerCase();

  // 1. Custom dictionary takes priority (case-insensitive lookup)
  if (custom) {
    const customKeys = Object.keys(custom);
    const match = customKeys.find((k) => k.toLowerCase() === lower);
    if (match !== undefined) return custom[match];
  }

  // 2. Built-in dictionary
  return BUILT_IN_DICTIONARY[lower];
}

/**
 * Checks whether a string is a known acronym/abbreviation
 * (all uppercase, 2–6 chars, or common mixed patterns like IPv4).
 *
 * Used to decide whether to split or preserve a token.
 *
 * @example
 * isAcronym("ID")    // true
 * isAcronym("API")   // true
 * isAcronym("IPv4")  // true
 * isAcronym("Hello") // false
 */
export function isAcronym(token: string): boolean {
  // All-caps 2–6 chars: "ID", "API", "HTTP", "HTTPS", "SKU"
  if (/^[A-Z]{2,6}$/.test(token)) return true;
  // Uppercase letters optionally followed by one lowercase then digits: IPv4, ESv6, H264
  if (/^[A-Z]{1,4}[a-z]?\d+$/.test(token)) return true;
  return false;
}
