// =============================================================================
// utils/crypto.ts
// Secure hashing for masked values using the Web Crypto API (Node + Browser).
//
// Design:
//   • Uses SubtleCrypto (available Node ≥ 15, all modern browsers).
//   • Falls back to a simple djb2-style hex hash for environments without
//     SubtleCrypto (SSR edge runtimes, very old Node).
//   • Async API returns a Promise — sync fallback for non-crypto environments.
//   • Never stores or logs original values.
// =============================================================================

// ---------------------------------------------------------------------------
// Sync fallback hash (djb2-inspired, hex output)
// ---------------------------------------------------------------------------

/**
 * Non-crypto djb2 hash — used only when SubtleCrypto is unavailable.
 * Produces a deterministic hex string; NOT cryptographically secure.
 * Suitable for pseudonymisation in environments without crypto.
 */
function djb2Hex(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ (input.charCodeAt(i) ?? 0);
    hash = hash >>> 0; // force unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Extended version that produces a 32-char hex string by running
 * djb2 twice with different salts.
 */
function djb2HexFull(input: string): string {
  const a = djb2Hex(input + "a");
  const b = djb2Hex(input + "b");
  const c = djb2Hex(input + "c");
  const d = djb2Hex(input + "d");
  return a + b + c + d;
}

// ---------------------------------------------------------------------------
// Async SHA-256 via SubtleCrypto
// ---------------------------------------------------------------------------

/**
 * Hashes a string using SHA-256 and returns the first `length` hex chars.
 * Uses SubtleCrypto when available, falls back to djb2.
 *
 * @param input   - The value to hash.
 * @param length  - Number of hex characters to return (max 64). Default: 40.
 */
export async function hashValue(input: string, length = 40): Promise<string> {
  try {
    const subtle =
      typeof globalThis.crypto !== "undefined"
        ? globalThis.crypto.subtle
        : undefined;

    if (subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return hex.slice(0, Math.min(length, hex.length));
    }
  } catch {
    // SubtleCrypto unavailable or failed — use fallback
  }
  return djb2HexFull(input).slice(0, Math.min(length, 32));
}

/**
 * Synchronous hash using the djb2 fallback.
 * Use this only when async is not possible.
 * NOT cryptographically secure.
 *
 * @param input   - The value to hash.
 * @param length  - Number of hex chars to return. Default: 40.
 */
export function hashValueSync(input: string, length = 40): string {
  return djb2HexFull(input).slice(0, Math.min(length, 32));
}
