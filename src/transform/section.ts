// =============================================================================
// transform/section.ts
// Converts a JSON object into a structured tree of Section → Field pairs
// suitable for consumption by any UI framework (Angular, React, Vue).
//
// Design:
//  • Framework-agnostic — outputs plain data objects only.
//  • Configurable section mapping (key → custom title).
//  • Include/exclude key filtering.
//  • Null filtering (controlled by includeNulls).
//  • Cycle-safe traversal.
//  • Pure — no mutation.
// =============================================================================

import type {
  Section,
  Field,
  FieldType,
  SectionConfig,
  SectionMapping,
  NormalizationResult,
} from "../types/section.types.js";
import type { JsonValue } from "../types/index.js";
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  DEFAULT_MAX_DEPTH,
} from "../core/traversal.js";
import { toDisplayLabel } from "./label.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Required<
  Omit<SectionConfig, "sectionMap" | "labels" | "descriptions">
> & {
  sectionMap: Readonly<Record<string, SectionMapping | string>>;
  labels: Readonly<Record<string, string>>;
  descriptions: Readonly<Record<string, string>>;
} = {
  sectionMap: {},
  excludeKeys: [],
  includeKeys: [],
  labels: {},
  labelOptions: {},
  maxDepth: DEFAULT_MAX_DEPTH,
  includeNulls: false,
  descriptions: {},
};

// ---------------------------------------------------------------------------
// Public: normalizeToSections
// ---------------------------------------------------------------------------

/**
 * Converts a JSON object (or array of objects) into an ordered array of
 * `Section` structures, each containing `Field` instances with resolved
 * human-readable labels and full dot-notation paths.
 *
 * @param input  - Any JSON-compatible value.
 * @param config - Section configuration.
 * @returns A NormalizationResult with sections, totalFields, processedPaths.
 *
 * @example
 * normalizeToSections({
 *   user: { firstName: "Alice", dob: "1990-01-01" },
 *   address: { city: "London", zip: "SW1A 1AA" },
 * }, {
 *   sectionMap: { user: "User Info", address: "Address Details" },
 *   labels: { dob: "Date of Birth" },
 * });
 * // →
 * // sections: [
 * //   { title: "User Info",        fields: [{label:"First Name",...},{label:"Date of Birth",...}], subsections: [] },
 * //   { title: "Address Details",  fields: [{label:"City",...},{label:"ZIP Code",...}],            subsections: [] },
 * // ]
 */
export function normalizeToSections(
  input: unknown,
  config: SectionConfig = {}
): NormalizationResult {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    sectionMap: config.sectionMap ?? DEFAULT_CONFIG.sectionMap,
    labels: config.labels ?? DEFAULT_CONFIG.labels,
    descriptions: config.descriptions ?? DEFAULT_CONFIG.descriptions,
  };

  const excludeSet = new Set(cfg.excludeKeys);
  const includeSet = new Set(cfg.includeKeys);
  const ctx = createTraversalContext();
  const processedPaths: string[] = [];
  let totalFields = 0;

  // ── helpers ───────────────────────────────────────────────────────────────

  function shouldExclude(key: string): boolean {
    if (isUnsafeKey(key)) return true;
    if (excludeSet.has(key)) return true;
    if (includeSet.size > 0 && !includeSet.has(key)) return true;
    return false;
  }

  function resolveLabel(key: string, path: string): string {
    // Path-specific override first
    if (Object.prototype.hasOwnProperty.call(cfg.labels, path)) return cfg.labels[path] as string;
    // Key-specific override
    if (Object.prototype.hasOwnProperty.call(cfg.labels, key)) return cfg.labels[key] as string;
    // Auto-generate
    return toDisplayLabel(key, cfg.labelOptions);
  }

  function resolveTitle(key: string, path: string): string {
    const mapping = cfg.sectionMap[path] ?? cfg.sectionMap[key];
    if (typeof mapping === "string") return mapping;
    if (mapping?.title) return mapping.title;
    return resolveLabel(key, path);
  }

  function getDescription(key: string, path: string): string | undefined {
    return cfg.descriptions[path] ?? cfg.descriptions[key];
  }

  function classifyType(value: unknown): FieldType {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return "array";
    if (isPlainObject(value)) return "object";
    return "primitive";
  }

  function makeField(
    key: string,
    value: unknown,
    path: string
  ): Field {
    const desc = getDescription(key, path);
    const base = {
      label: resolveLabel(key, path),
      value: value as JsonValue,
      path,
      key,
      type: classifyType(value),
    };
    const field: Field = desc !== undefined ? { ...base, description: desc } : base;
    processedPaths.push(path);
    totalFields++;
    return Object.freeze(field) as Field;
  }

  // ── core builder ──────────────────────────────────────────────────────────

  function buildSection(
    obj: Record<string, unknown>,
    key: string,
    path: string,
    depth: number
  ): Section {
    const title = resolveTitle(key, path);
    const fields: Field[] = [];
    const subsections: Section[] = [];

    if (ctx.hasSeen(obj)) {
      return Object.freeze<Section>({ title, fields: [], subsections: [], path });
    }
    ctx.markSeen(obj);

    // Get the section-level mapping for field filtering
    const mapping = cfg.sectionMap[path] ?? cfg.sectionMap[key];
    const sectionInclude =
      typeof mapping === "object" && mapping.includeFields
        ? new Set(mapping.includeFields)
        : null;
    const sectionExclude =
      typeof mapping === "object" && mapping.excludeFields
        ? new Set(mapping.excludeFields)
        : null;

    for (const [childKey, childValue] of Object.entries(obj)) {
      if (shouldExclude(childKey)) continue;
      if (sectionInclude && !sectionInclude.has(childKey)) continue;
      if (sectionExclude?.has(childKey)) continue;

      const childPath = path ? `${path}.${childKey}` : childKey;

      // Skip nulls unless configured to include them
      if ((childValue === null || childValue === undefined) && !cfg.includeNulls) {
        continue;
      }

      if (depth < cfg.maxDepth && isPlainObject(childValue)) {
        // Recurse — create a subsection
        subsections.push(
          buildSection(
            childValue as Record<string, unknown>,
            childKey,
            childPath,
            depth + 1
          )
        );
      } else if (Array.isArray(childValue)) {
        const hasObjectItems = childValue.some(
          (item) => isPlainObject(item) || Array.isArray(item)
        );

        if (hasObjectItems && depth < cfg.maxDepth) {
          // Array of objects → child subsections with index titles
          const childSubsections: Section[] = childValue
            .filter(isPlainObject)
            .map((item, i) =>
              buildSection(
                item as Record<string, unknown>,
                childKey,
                `${childPath}[${i}]`,
                depth + 1
              )
            );

          subsections.push(
            Object.freeze<Section>({
              title: resolveLabel(childKey, childPath),
              fields: Object.freeze([]),
              subsections: Object.freeze(childSubsections),
              path: childPath,
            })
          );
        } else {
          // Primitive array → single field
          fields.push(makeField(childKey, childValue, childPath));
        }
      } else {
        fields.push(makeField(childKey, childValue, childPath));
      }
    }

    ctx.unmarkSeen(obj);

    return Object.freeze<Section>({
      title,
      fields: Object.freeze(fields),
      subsections: Object.freeze(subsections),
      path,
    });
  }

  // ── entry point ───────────────────────────────────────────────────────────

  let sections: Section[] = [];

  if (Array.isArray(input)) {
    sections = input
      .filter(isPlainObject)
      .map((item, i) =>
        buildSection(
          item as Record<string, unknown>,
          `[${i}]`,
          `[${i}]`,
          0
        )
      );
  } else if (isPlainObject(input)) {
    // Top-level keys become the sections
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (shouldExclude(key)) continue;

      if (isPlainObject(value)) {
        sections.push(buildSection(value as Record<string, unknown>, key, key, 0));
      } else {
        // Top-level primitive or array → a single-field section
        const field = makeField(key, value, key);
        sections.push(
          Object.freeze<Section>({
            title: resolveTitle(key, key),
            fields: Object.freeze([field]),
            subsections: Object.freeze([]),
            path: key,
          })
        );
      }
    }
  }

  return Object.freeze<NormalizationResult>({
    sections: Object.freeze(sections),
    totalFields,
    processedPaths: Object.freeze(processedPaths),
  });
}

// ---------------------------------------------------------------------------
// Public: flattenSectionsToFields
// ---------------------------------------------------------------------------

/**
 * Flattens a section tree into a single ordered array of all `Field` instances.
 * Traverses depth-first (fields before subsection fields).
 *
 * Useful for list-based rendering, CSV export, or simple detail panels
 * that don't need hierarchy.
 *
 * @param sections - The section array from `normalizeToSections`.
 * @returns A frozen flat array of all Fields.
 *
 * @example
 * const { sections } = normalizeToSections({ user: { name: "Alice", age: 30 } });
 * flattenSectionsToFields(sections);
 * // → [
 * //   { label: "Name", value: "Alice", path: "user.name", ... },
 * //   { label: "Age",  value: 30,      path: "user.age",  ... },
 * // ]
 */
export function flattenSectionsToFields(
  sections: readonly Section[]
): readonly Field[] {
  const fields: Field[] = [];

  function collect(section: Section): void {
    for (const field of section.fields) {
      fields.push(field);
    }
    for (const sub of section.subsections) {
      collect(sub);
    }
  }

  for (const section of sections) {
    collect(section);
  }

  return Object.freeze(fields);
}

// ---------------------------------------------------------------------------
// Public: mergeSections
// ---------------------------------------------------------------------------

/**
 * Merges two arrays of sections by title.
 * Sections with the same title have their fields and subsections combined.
 * Useful when processing multiple API responses into a unified view.
 *
 * @example
 * mergeSections(sectionsA, sectionsB)
 */
export function mergeSections(
  a: readonly Section[],
  b: readonly Section[]
): readonly Section[] {
  const map = new Map<string, { fields: Field[]; subsections: Section[]; path: string }>();

  for (const section of [...a, ...b]) {
    const existing = map.get(section.title);
    if (existing) {
      existing.fields.push(...section.fields);
      existing.subsections.push(...section.subsections);
    } else {
      map.set(section.title, {
        fields: [...section.fields],
        subsections: [...section.subsections],
        path: section.path,
      });
    }
  }

  return Object.freeze(
    Array.from(map.entries()).map(([title, { fields, subsections, path }]) =>
      Object.freeze<Section>({
        title,
        fields: Object.freeze(fields),
        subsections: Object.freeze(subsections),
        path,
      })
    )
  );
}
