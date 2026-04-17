// =============================================================================
// structure/remap.ts
// Transforms an object's structure by mapping source paths to target paths.
//
// Design:
//   • Uses extractField (v0.1.0) to read source values safely.
//   • Uses setDeep (internal) to write target paths in the output.
//   • Prototype-pollution safe at every step.
//   • By default only mapped fields appear; set keepUnmapped: true to copy rest.
//   • Pure — never mutates input.
// =============================================================================

import type { RemapOptions } from "../types/structure.types.js";
import type { JsonValue } from "../types/index.js";
import { isPlainObject, isUnsafeKey } from "../core/traversal.js";
import { extractField } from "../core/extract.js";
import { splitPath, joinPath } from "../utils/path.js";

// ---------------------------------------------------------------------------
// Internal: deep set
// ---------------------------------------------------------------------------

function setDeep(
  obj: Record<string, unknown>,
  segments: Array<string | number>,
  value: unknown
): Record<string, unknown> {
  if (segments.length === 0) return obj;

  const [head, ...rest] = segments;
  if (head === undefined) return obj;

  const key = String(head);
  if (isUnsafeKey(key)) return obj;

  const result = { ...obj };

  if (rest.length === 0) {
    result[key] = value;
  } else {
    const existing = result[key];
    const child: Record<string, unknown> = isPlainObject(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    result[key] = setDeep(child, rest, value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal: deep copy all keys not in mapped sources
// ---------------------------------------------------------------------------

function copyUnmapped(
  source: Record<string, unknown>,
  output: Record<string, unknown>,
  mappedSourcePaths: Set<string>,
  path: string,
  depth: number,
  maxDepth: number
): Record<string, unknown> {
  let result = { ...output };
  for (const [key, value] of Object.entries(source)) {
    if (isUnsafeKey(key)) continue;
    const childPath = joinPath(path, key);
    // Skip if this key's path was explicitly mapped
    if (mappedSourcePaths.has(childPath) || mappedSourcePaths.has(key)) continue;

    if (depth < maxDepth && isPlainObject(value)) {
      const existing = result[key];
      const childOutput: Record<string, unknown> = isPlainObject(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
      result[key] = copyUnmapped(
        value as Record<string, unknown>,
        childOutput,
        mappedSourcePaths,
        childPath,
        depth + 1,
        maxDepth
      );
    } else if (!Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transforms an object's structure by mapping source dot-notation paths
 * to target dot-notation paths.
 *
 * @param obj     - The source object.
 * @param mapping - Map of `"sourcePath"` → `"targetPath"`.
 * @param options - Remap options.
 * @returns A new object with the remapped structure.
 *
 * @example
 * remapObject(
 *   { user: { name: "Alice", age: 30 }, meta: { id: 1 } },
 *   {
 *     "user.name": "profile.fullName",
 *     "user.age":  "profile.details.age",
 *     "meta.id":   "id",
 *   }
 * )
 * // → { profile: { fullName: "Alice", details: { age: 30 } }, id: 1 }
 *
 * @example
 * // Keep unmapped fields
 * remapObject(
 *   { a: 1, b: 2, c: 3 },
 *   { "a": "x" },
 *   { keepUnmapped: true }
 * )
 * // → { x: 1, b: 2, c: 3 }
 *
 * @example
 * // With default value for missing source path
 * remapObject(
 *   { user: { name: "Alice" } },
 *   { "user.name": "name", "user.email": "email" },
 *   { defaultValue: "N/A" }
 * )
 * // → { name: "Alice", email: "N/A" }
 */
export function remapObject(
  obj: Record<string, unknown>,
  mapping: Readonly<Record<string, string>>,
  options: RemapOptions = {}
): Record<string, unknown> {
  const keepUnmapped = options.keepUnmapped ?? false;
  const defaultValue = options.defaultValue;
  const maxDepth = options.maxDepth ?? 20;

  let output: Record<string, unknown> = {};
  const mappedSourcePaths = new Set<string>(Object.keys(mapping));

  for (const [sourcePath, targetPath] of Object.entries(mapping)) {
    // Validate paths
    if (!sourcePath || !targetPath) continue;
    if (isUnsafeKey(sourcePath) || isUnsafeKey(targetPath)) continue;

    // Extract value from source
    const extracted = extractField(obj, sourcePath);
    const value: unknown =
      extracted !== undefined ? extracted : defaultValue;

    if (value === undefined) continue;

    // Set value at target path
    const targetSegments = splitPath(targetPath);
    if (targetSegments.some((s) => typeof s === "string" && isUnsafeKey(s))) {
      continue;
    }

    output = setDeep(output, targetSegments, value as JsonValue);
  }

  // Optionally carry over unmapped fields
  if (keepUnmapped) {
    output = copyUnmapped(obj, output, mappedSourcePaths, "", 0, maxDepth);
  }

  return output;
}

/**
 * Returns only the remapped data directly (no wrapper).
 */
export function remapObjectDirect(
  obj: Record<string, unknown>,
  mapping: Readonly<Record<string, string>>,
  options: RemapOptions = {}
): Record<string, unknown> {
  return remapObject(obj, mapping, options);
}
