# @heyblank-labs/json-flux

> **Flow, shape, and transform JSON effortlessly.**

A lightweight, TypeScript-first, framework-agnostic utility library for safely processing deeply nested JSON structures. Zero runtime dependencies. Tree-shakable. Runs anywhere — Node.js, browser, and all SSR environments.

[![npm version](https://img.shields.io/npm/v/@heyblank-labs/json-flux)](https://www.npmjs.com/package/@heyblank-labs/json-flux)
[![license](https://img.shields.io/npm/l/@heyblank-labs/json-flux)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-447%20passing-brightgreen)]()
[![coverage](https://img.shields.io/badge/coverage-98%25-brightgreen)]()

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Version History](#version-history)
- [v0.1.0 — Core](#v010--core)
  - [flattenObject](#flattenobjectobj-options)
  - [flattenArray](#flattenarrayarr-options-omitindexprefix)
  - [removeNulls](#removenullsvalue-options)
  - [deepSafeParse](#deepsafeparseinput-options)
  - [safeParse](#safeparsevalue-options)
  - [collectAllKeys](#collectallkeysinput-options)
  - [extractField](#extractfieldobj-path-options)
  - [hasField](#hasfieldobj-path)
  - [collectRowKeys](#collectrowkeysrows)
  - [isEmpty](#isemptyvalue)
  - [Helpers](#helpers)
  - [Traversal Utilities](#traversal-utilities-advanced)
- [v0.2.0 — Labels & Sections](#v020--labels--sections)
  - [toDisplayLabel](#todisplaylabelkey-options)
  - [labelKeys](#labelkeyskeys-options)
  - [clearLabelCache](#clearlabelcache)
  - [humanize](#humanizeobj-options)
  - [humanizeArray](#humanizearrayarr-options)
  - [normalizeToSections](#normalizetosectionsinput-config)
  - [flattenSectionsToFields](#flattensectionstofieldssections)
  - [mergeSections](#mergesectionsa-b)
  - [Built-in Dictionary](#built-in-dictionary)
  - [String Utilities](#string-utilities-advanced)
- [v0.3.0 — Filtering & Visibility](#v030--filtering--visibility)
  - [excludeKeys](#excludekeysobj-keys-options)
  - [includeKeys](#includekeysobj-keys-options)
  - [hideIf](#hideifobj-predicate-options)
  - [stripEmpty](#stripemptyobj-options)
  - [Built-in Predicates](#built-in-predicates)
  - [Path Matching Engine](#path-matching-engine)
  - [Path Utilities](#path-utilities-advanced)
- [TypeScript Types](#typescript-types)
- [Edge Cases & Gotchas](#edge-cases--gotchas)
- [Security](#security)
- [Performance](#performance)
- [Framework Adapters](#framework-adapters)
- [Distribution](#distribution)
- [Roadmap](#roadmap)

---

## Installation

```bash
npm install @heyblank-labs/json-flux
# or
pnpm add @heyblank-labs/json-flux
# or
yarn add @heyblank-labs/json-flux
```

---

## Quick Start

```ts
import {
  deepSafeParse,
  removeNulls,
  flattenObject,
  extractField,
  humanize,
  normalizeToSections,
  flattenSectionsToFields,
} from '@heyblank-labs/json-flux';

// Raw double-serialized API response
const raw = '{"customer":{"firstName":"Alice","dob":"1990-01-01","user_id":42,"address":{"city":"London","zip":null}}}';

// Step 1 — Parse safely (handles double/triple-serialized JSON)
const parsed = deepSafeParse(raw);

// Step 2 — Strip nulls and empty values
const cleaned = removeNulls(parsed);

// Step 3 — Flatten to dot-notation (for table rendering)
const { data } = flattenObject(cleaned);
// → { "customer.firstName": "Alice", "customer.dob": "1990-01-01", "customer.address.city": "London", ... }

// Step 4 — Extract a specific field safely
const city = extractField(cleaned, 'customer.address.city', { defaultValue: 'N/A' });
// → "London"

// Step 5 — Humanize all keys for display
humanize(cleaned);
// → { "Customer": { "First Name": "Alice", "Date of Birth": "1990-01-01", "User ID": 42, "Address": { "City": "London" } } }

// Step 6 — Build a UI-ready section structure
const { sections } = normalizeToSections(cleaned, {
  sectionMap: { customer: 'Customer Details' },
  labels: { dob: 'Date of Birth' },
});

// Step 7 — Flatten sections to a simple field list
const fields = flattenSectionsToFields(sections);
// → [
//   { label: "First Name",    value: "Alice",      path: "customer.firstName", type: "primitive" },
//   { label: "Date of Birth", value: "1990-01-01", path: "customer.dob",       type: "primitive" },
//   { label: "User ID",       value: 42,           path: "customer.user_id",   type: "primitive" },
//   { label: "City",          value: "London",    path: "customer.address.city", type: "primitive" },
// ]
```

---

## Version History

| Version | Status | What's included |
|---|---|---|
| **v0.1.0** | Released | Core — flatten, parse, clean, keys, extract, helpers |
| **v0.2.0** | Released | Labels & Sections — `toDisplayLabel`, `humanize`, `normalizeToSections` |
| **v0.3.0** | Released | Filtering & Visibility — `excludeKeys`, `includeKeys`, `hideIf`, `stripEmpty` |

---

## v0.1.0 — Core

> Released · Foundational JSON utilities — safe parsing, flattening, cleaning, and extraction.

---

### `flattenObject(obj, options?)`

Converts a deeply nested object into a single-level record of dot-notation paths.

```ts
import { flattenObject } from '@heyblank-labs/json-flux';

const { data, leafCount, arrayObjectPaths, maxDepthReached } = flattenObject({
  user: { name: 'Alice', age: 30 },
  tags: ['ts', 'json'],
  items: [{ id: 1 }, { id: 2 }],
});

// data → {
//   "user.name": "Alice",
//   "user.age": 30,
//   "tags": "ts, json",         // primitive arrays → comma-joined string
//   "items": "[{\"id\":1},...]" // object arrays → JSON string
// }
// arrayObjectPaths → ["items"]
// leafCount → 3
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `delimiter` | `string` | `"."` | Key path separator |
| `maxDepth` | `number` | `20` | Max recursion depth; deeper nodes are stringified |
| `skipArrays` | `boolean` | `false` | Store arrays as JSON strings without traversing |
| `excludeKeys` | `string[]` | `[]` | Keys to skip entirely at any depth |

**Returns `FlattenResult`:**

```ts
{
  data: FlatRecord;               // flat key → value record
  leafCount: number;              // total leaf nodes written
  maxDepthReached: number;        // deepest level visited
  arrayObjectPaths: string[];     // paths that contained arrays of objects
}
```

**Behaviour notes:**
- Circular references are replaced with `"[Circular]"` — never throws
- Keys containing the delimiter are auto-escaped as `[key]` to avoid path collisions
- `__proto__`, `prototype`, `constructor` keys are silently dropped
- Empty objects store as `null` at their path
- Empty arrays store as `null` at their path

---

### `flattenArray(arr, options?, omitIndexPrefix?)`

Flattens an array of objects into an array of flat records. Useful for building dynamic table rows.

```ts
import { flattenArray } from '@heyblank-labs/json-flux';

const { rows, allKeys, arrayObjectPaths, skippedCount } = flattenArray([
  { name: 'Alice', role: 'admin' },
  { name: 'Bob',   role: 'user' },
]);

// rows      → [{ "name": "Alice", "role": "admin" }, { "name": "Bob", "role": "user" }]
// allKeys   → ["name", "role"]
// skippedCount → 0 (non-object items are counted here)
```

Set `omitIndexPrefix` to `false` to prefix keys with the row index:

```ts
flattenArray([{ name: 'Alice' }], {}, false);
// rows[0] → { "0.name": "Alice" }
```

**Returns `FlattenArrayResult`:**

```ts
{
  rows: readonly FlatRecord[];
  arrayObjectPaths: readonly string[];
  allKeys: readonly string[];
  skippedCount: number;
}
```

---

### `collectRowKeys(rows)`

Collects the union of all keys across an array of flat records. Ideal for building dynamic table column definitions.

```ts
import { collectRowKeys } from '@heyblank-labs/json-flux';

collectRowKeys([{ a: 1, b: 2 }, { b: 3, c: 4 }]);
// → ["a", "b", "c"]
```

---

### `removeNulls(value, options?)`

Recursively removes `null`, `undefined`, empty strings, and optionally empty arrays and objects. Returns a new structure — **never mutates input**.

```ts
import { removeNulls } from '@heyblank-labs/json-flux';

removeNulls({
  name: 'Alice',
  age: null,
  address: { city: 'London', zip: '' },
  tags: [null, 'ts', null],
  meta: {},
});
// → { name: 'Alice', address: { city: 'London' }, tags: ['ts'] }
// null, empty string, empty object all removed
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `removeEmptyStrings` | `boolean` | `true` | Remove `""` values |
| `removeEmptyArrays` | `boolean` | `false` | Remove `[]` values |
| `removeEmptyObjects` | `boolean` | `true` | Remove `{}` after cleaning child keys |
| `maxDepth` | `number` | `20` | Recursion depth guard |

**Important:** `0`, `false`, and non-empty strings are always preserved — only truly empty/absent values are removed.

---

### `deepSafeParse(input, options?)`

Recursively parses a value that may be a stringified JSON string — including double or triple-serialized responses common in enterprise APIs. Applied to every string node in the tree.

```ts
import { deepSafeParse } from '@heyblank-labs/json-flux';

// Double-serialized API response
const raw = '"{\\"user\\":{\\"name\\":\\"Alice\\"}}"';
deepSafeParse(raw);
// → { user: { name: 'Alice' } }

// Object containing nested JSON strings
deepSafeParse({ payload: '{"status":"ok","count":5}' });
// → { payload: { status: 'ok', count: 5 } }

// Triple-serialized
const triple = JSON.stringify(JSON.stringify(JSON.stringify({ deep: true })));
deepSafeParse(triple);
// → { deep: true }
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `maxIterations` | `number` | `10` | Max unwrapping iterations per string value |
| `maxDepth` | `number` | `20` | Recursion depth guard for tree traversal |
| `throwOnPollution` | `boolean` | `false` | Throw on `__proto__` / `constructor` keys instead of silently dropping |

**Security:** Uses `JSON.parse` only — no `eval`. Every parsed object is sanitized to drop `__proto__`, `prototype`, and `constructor` keys before being returned.

---

### `safeParse(value, options?)`

Single-level variant of `deepSafeParse`. Iteratively unwraps one value that may be a stringified JSON string. Does **not** recurse into the result.

```ts
import { safeParse } from '@heyblank-labs/json-flux';

safeParse(42);               // → 42   (non-strings returned as-is)
safeParse('{"a":1}');        // → { a: 1 }
safeParse('"not json"');     // → "not json"
safeParse('{bad json}');     // → "{bad json}"  (never throws)
safeParse('true');           // → true
safeParse('null');           // → null
```

---

### `collectAllKeys(input, options?)`

Collects every unique key (or full dot-notation path) across a deeply nested structure. Useful for schema inspection and dynamic field mapping.

```ts
import { collectAllKeys } from '@heyblank-labs/json-flux';

// Bare keys (default)
const { keys, totalNodes } = collectAllKeys({
  user: { name: 'Alice', role: 'admin' },
  active: true,
});
// keys → ['user', 'name', 'role', 'active']
// totalNodes → 4

// Full dot-notation paths
collectAllKeys({ user: { name: 'Alice' } }, { dotNotation: true });
// keys → ['user', 'user.name']
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `dotNotation` | `boolean` | `false` | Return full paths instead of bare key names |
| `delimiter` | `string` | `"."` | Path delimiter when `dotNotation` is true |
| `maxDepth` | `number` | `20` | Recursion depth guard |

---

### `extractField(obj, path, options?)`

Safe getter using dot-notation and bracket-notation paths. **Never throws** — returns `defaultValue` (or `undefined`) when the path is missing.

```ts
import { extractField } from '@heyblank-labs/json-flux';

const data = {
  users: [
    { id: 1, address: { city: 'London' } },
    { id: 2, address: { city: 'Mumbai'  } },
  ],
};

extractField(data, 'users[0].address.city');              // → "London"
extractField(data, 'users[1].id');                        // → 2
extractField(data, 'users[99].id');                       // → undefined
extractField(data, 'missing.path', { defaultValue: 'N/A' }); // → "N/A"
extractField({ a: null }, 'a');                           // → null
```

**Supported path formats:**

| Format | Example |
|---|---|
| Dot notation | `user.address.city` |
| Array indexing | `items[0].name` |
| Mixed | `data[0].items[2].label` |
| Bracket string keys | `map[someKey].value` |
| Nested arrays | `matrix[0][1]` |

---

### `hasField(obj, path)`

Checks whether a dot-notation path exists in an object. Returns `true` even when the value at that path is `null`.

```ts
import { hasField } from '@heyblank-labs/json-flux';

hasField({ a: { b: null } }, 'a.b');  // → true  (path exists, value is null)
hasField({ a: { b: 1 } },   'a.b');  // → true
hasField({ a: 1 },           'a.b');  // → false  (path doesn't exist)
hasField(null,               'a');    // → false
```

---

### `parsePath(path)`

Parses a dot/bracket notation path string into an ordered array of segments.

```ts
import { parsePath } from '@heyblank-labs/json-flux';

parsePath('a.b.c');             // → ['a', 'b', 'c']
parsePath('users[0].name');     // → ['users', 0, 'name']
parsePath('data[0].items[2]'); // → ['data', 0, 'items', 2]
parsePath('[0][1]');            // → [0, 1]
```

---

### `isEmpty(value)`

Returns `true` for `null`, `undefined`, `""`, `[]`, and `{}`. Returns `false` for all other values including `0` and `false`.

```ts
import { isEmpty } from '@heyblank-labs/json-flux';

isEmpty(null);      // → true
isEmpty(undefined); // → true
isEmpty('');        // → true
isEmpty([]);        // → true
isEmpty({});        // → true
isEmpty(0);         // → false  ← zero is a valid value
isEmpty(false);     // → false  ← false is a valid value
isEmpty('hello');   // → false
isEmpty([1]);       // → false
```

---

### Helpers

General-purpose pure utilities re-exported for convenience.

```ts
import {
  deepMerge,
  deepEqual,
  deepClone,
  omitKeys,
  pickKeys,
  toSafeString,
} from '@heyblank-labs/json-flux';
```

#### `deepMerge(...sources)`

Deep-merges multiple plain objects left-to-right. Later sources win on key conflicts. Does not mutate any source.

```ts
deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 });
// → { a: { x: 1, y: 2 }, b: 3 }

deepMerge({ role: 'user' }, { role: 'admin' });
// → { role: 'admin' }
```

#### `deepEqual(a, b)`

Deep equality check for JSON-compatible values.

```ts
deepEqual({ a: [1, 2, 3] }, { a: [1, 2, 3] }); // → true
deepEqual({ a: 1 },         { a: 2 });           // → false
deepEqual(null,              null);              // → true
```

#### `deepClone(value)`

Creates a deep clone of any JSON-compatible value. Uses `structuredClone` where available, falls back to JSON round-trip.

```ts
const clone = deepClone({ user: { name: 'Alice', tags: ['a', 'b'] } });
// Fully independent — mutations to clone don't affect original
```

#### `omitKeys(obj, keys)`

Returns a shallow copy of an object with the specified keys removed.

```ts
omitKeys({ a: 1, b: 2, c: 3 }, ['b', 'c']); // → { a: 1 }
```

#### `pickKeys(obj, keys)`

Returns a shallow copy containing only the specified keys.

```ts
pickKeys({ a: 1, b: 2, c: 3 }, ['a', 'c']); // → { a: 1, c: 3 }
```

#### `toSafeString(value)`

Converts any value to a display-safe string. `null`/`undefined` → `""`, objects/arrays → `JSON.stringify`.

```ts
toSafeString(null);        // → ""
toSafeString(42);          // → "42"
toSafeString({ id: 1 });  // → '{"id":1}'
toSafeString([1, 2]);      // → "[1,2]"
```

---

### Traversal Utilities (Advanced)

Low-level primitives exposed for plugin authors and advanced use cases.

```ts
import {
  createTraversalContext,
  isPlainObject,
  isUnsafeKey,
  UNSAFE_KEYS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_DELIMITER,
} from '@heyblank-labs/json-flux';
```

#### `createTraversalContext()`

Creates an isolated `WeakSet`-backed cycle-detection context. Use one per traversal call.

```ts
const ctx = createTraversalContext();
// ctx.hasSeen(obj)   → boolean
// ctx.markSeen(obj)  → void
// ctx.unmarkSeen(obj)→ void (for backtracking)
```

#### `isPlainObject(value)`

Type guard that returns `true` only for plain objects (not arrays, not `null`, not class instances, not `Date`).

```ts
isPlainObject({});           // → true
isPlainObject(Object.create(null)); // → true
isPlainObject([]);           // → false
isPlainObject(new Date());   // → false
```

#### `isUnsafeKey(key)`

Returns `true` for `__proto__`, `prototype`, and `constructor`.

```ts
isUnsafeKey('__proto__');  // → true
isUnsafeKey('name');       // → false
```

---

## v0.2.0 — Labels & Sections

> Released · Human-readable label generation and structured UI-ready output — built on top of the v0.1.0 core.

---

### `toDisplayLabel(key, options?)`

Converts a raw JSON key or dot-notation path into a human-readable label. The primary label engine used by `humanize` and `normalizeToSections` internally.

**Resolution order:**
1. User-supplied `dictionary` (case-insensitive exact key match)
2. Built-in abbreviation dictionary (`dob` → `Date of Birth`, `api` → `API`…)
3. Per-token dictionary matching after tokenizing (`user_id` → token `id` → `ID`)
4. Auto-tokenise camelCase / snake_case / kebab-case / SCREAMING_SNAKE → apply case style

```ts
import { toDisplayLabel } from '@heyblank-labs/json-flux';

// camelCase
toDisplayLabel('firstName')           // → "First Name"
toDisplayLabel('userFirstName')       // → "User First Name"

// snake_case and SCREAMING_SNAKE
toDisplayLabel('user_id')             // → "User ID"
toDisplayLabel('FIRST_NAME')          // → "First Name"
toDisplayLabel('first_name')          // → "First Name"

// kebab-case
toDisplayLabel('first-name')          // → "First Name"

// Acronym intelligence
toDisplayLabel('dob')                 // → "Date of Birth"   (built-in dictionary)
toDisplayLabel('XMLParser')           // → "XML Parser"
toDisplayLabel('getHTTPResponse')     // → "Get HTTP Response"
toDisplayLabel('userID')              // → "User ID"
toDisplayLabel('ssn')                 // → "SSN"

// Dot-notation paths — uses last segment only
toDisplayLabel('user.address.city')   // → "City"
toDisplayLabel('customer.dob')        // → "Date of Birth"

// Custom dictionary override
toDisplayLabel('firstName', { dictionary: { firstName: 'Given Name' } })
// → "Given Name"

// Sentence case
toDisplayLabel('firstName', { caseStyle: 'sentence' })
// → "First name"

// Disable acronym preservation
toDisplayLabel('userID', { preserveAcronyms: false })
// → "User Id"
```

**`LabelOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `caseStyle` | `"title" \| "sentence"` | `"title"` | Title Case or Sentence case output |
| `preserveAcronyms` | `boolean` | `true` | Keep ID, API, HTTP, HTTPS as uppercase |
| `dictionary` | `Record<string, string>` | — | Custom key → label overrides (checked first) |
| `delimiter` | `string` | `"."` | Path segment delimiter |

> Labels are **memoised** (LRU cache, 2,000 entries). Repeated calls for the same key are O(1). Call `clearLabelCache()` to reset.

---

### `labelKeys(keys, options?)`

Bulk-converts an array of raw keys to a frozen `rawKey → label` map. Ideal for building table column headers.

```ts
import { labelKeys } from '@heyblank-labs/json-flux';

labelKeys(['firstName', 'user_id', 'dob', 'createdAt', 'api_version'])
// → {
//   firstName:   "First Name",
//   user_id:     "User ID",
//   dob:         "Date of Birth",
//   createdAt:   "Created At",
//   api_version: "API Version",
// }

// With shared options
labelKeys(['firstName', 'lastName'], { caseStyle: 'sentence' })
// → { firstName: "First name", lastName: "Last name" }
```

---

### `clearLabelCache()`

Clears the internal label memoisation cache. Useful when switching label configurations at runtime or in test environments.

```ts
import { clearLabelCache } from '@heyblank-labs/json-flux';

clearLabelCache();
```

---

### `humanize(obj, options?)`

Transforms the **keys** of an object into human-readable labels. All values are preserved exactly as-is. Circular references are handled safely.

```ts
import { humanize } from '@heyblank-labs/json-flux';

// ── Basic ─────────────────────────────────────────────────────────────────────
humanize({ firstName: 'Alice', user_id: 42, dob: '1990-01-01' })
// → { "First Name": "Alice", "User ID": 42, "Date of Birth": "1990-01-01" }

// ── Deep (default) — recurses into nested objects ─────────────────────────────
humanize({
  user: {
    firstName: 'Alice',
    address: { zipCode: 'SW1A 1AA', country_code: 'GB' },
  },
})
// → {
//   "User": {
//     "First Name": "Alice",
//     "Address": { "Zip Code": "SW1A 1AA", "Country Code": "GB" }
//   }
// }

// ── Arrays of objects — recurses into each item ────────────────────────────────
humanize({ orders: [{ orderId: 'ORD-001' }, { orderId: 'ORD-002' }] })
// → { "Orders": [{ "Order ID": "ORD-001" }, { "Order ID": "ORD-002" }] }

// ── Flat mode — collapses all levels, path segments joined as label ────────────
humanize({ user: { firstName: 'Alice' } }, { flatten: true })
// → { "User First Name": "Alice" }

// ── Shallow mode — only top-level keys humanized ──────────────────────────────
humanize({ user: { firstName: 'Alice' } }, { deep: false })
// → { "User": { firstName: "Alice" } }   ← inner keys unchanged

// ── Explicit label overrides ──────────────────────────────────────────────────
humanize(
  { dob: '1990-01-01', ref_num: 'REF-001' },
  { labels: { dob: 'Birthday', ref_num: 'Reference Number' } }
)
// → { "Birthday": "1990-01-01", "Reference Number": "REF-001" }
```

**`HumanizeOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `deep` | `boolean` | `true` | Recursively humanize nested objects and array items |
| `flatten` | `boolean` | `false` | Collapse to one level; path segments joined as label |
| `labels` | `Record<string, string>` | — | Explicit key → label overrides (case-insensitive match) |
| `labelOptions` | `LabelOptions` | — | Options passed through to `toDisplayLabel` |

---

### `humanizeArray(arr, options?)`

Applies `humanize` to every item in an array of objects. Accepts the same options as `humanize`.

```ts
import { humanizeArray } from '@heyblank-labs/json-flux';

humanizeArray([
  { firstName: 'Alice', user_id: 1 },
  { firstName: 'Bob',   user_id: 2 },
])
// → [
//   { "First Name": "Alice", "User ID": 1 },
//   { "First Name": "Bob",   "User ID": 2 },
// ]

// With label overrides applied to all items
humanizeArray(
  [{ dob: '1990-01-01' }, { dob: '1985-06-12' }],
  { labels: { dob: 'Birthday' } }
)
// → [{ "Birthday": "1990-01-01" }, { "Birthday": "1985-06-12" }]
```

---

### `normalizeToSections(input, config?)`

Converts any JSON value into an ordered tree of `Section` objects, each containing typed `Field` instances with resolved human-readable labels, values, and full dot-notation paths. The primary output format for UI detail panels, forms, and data viewers.

```ts
import { normalizeToSections } from '@heyblank-labs/json-flux';

const { sections, totalFields, processedPaths } = normalizeToSections({
  customer: {
    firstName: 'Alice',
    lastName:  'Smith',
    dob:       '1990-01-01',
    email:     'alice@example.com',
  },
  address: {
    line1:   '123 Main Street',
    city:    'London',
    zipCode: 'SW1A 1AA',
    country: 'United Kingdom',
  },
  orders: [
    { orderId: 'ORD-001', total: 1500 },
    { orderId: 'ORD-002', total: 2200 },
  ],
}, {
  sectionMap: {
    customer: 'Customer Details',
    address:  { title: 'Shipping Address' },
    orders:   'Order History',
  },
  labels: {
    dob:     'Date of Birth',
    zipCode: 'ZIP Code',
  },
  excludeKeys:  ['internalRef'],
  descriptions: { dob: 'ISO 8601 format — YYYY-MM-DD' },
});

// sections[0] →
// {
//   title: "Customer Details",
//   path:  "customer",
//   fields: [
//     { label: "First Name",    value: "Alice",           path: "customer.firstName", key: "firstName", type: "primitive" },
//     { label: "Last Name",     value: "Smith",           path: "customer.lastName",  key: "lastName",  type: "primitive" },
//     { label: "Date of Birth", value: "1990-01-01",      path: "customer.dob",       key: "dob",       type: "primitive", description: "ISO 8601 format — YYYY-MM-DD" },
//     { label: "Email",         value: "alice@...",       path: "customer.email",     key: "email",     type: "primitive" },
//   ],
//   subsections: []
// }
//
// sections[1] → { title: "Shipping Address", path: "address", fields: [...] }
// sections[2] → { title: "Order History",    path: "orders",  fields: [], subsections: [item 0, item 1] }
```

**Nested objects become subsections automatically:**

```ts
normalizeToSections({
  user: {
    name: 'Alice',
    address: { city: 'London', zip: 'SW1A 1AA' },
    preferences: { theme: 'dark', language: 'en' },
  },
})
// sections[0] = {
//   title: "User",
//   fields: [{ label: "Name", value: "Alice", ... }],
//   subsections: [
//     { title: "Address",     fields: [city field, zip field] },
//     { title: "Preferences", fields: [theme field, language field] },
//   ]
// }
```

**`SectionConfig`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `sectionMap` | `Record<string, string \| SectionMapping>` | — | Map key → custom section title or full SectionMapping |
| `excludeKeys` | `string[]` | `[]` | Keys to skip at all levels |
| `includeKeys` | `string[]` | `[]` | Whitelist — all other keys are excluded |
| `labels` | `Record<string, string>` | — | Key or dot-notation path → label override |
| `labelOptions` | `LabelOptions` | — | Options forwarded to `toDisplayLabel` |
| `maxDepth` | `number` | `20` | Recursion depth limit |
| `includeNulls` | `boolean` | `false` | Include fields with `null` values in output |
| `descriptions` | `Record<string, string>` | — | Key or path → tooltip/description text for `Field.description` |

**`SectionMapping` (object form of sectionMap value):**

```ts
{
  title?: string;              // override the section heading
  description?: string;        // section-level tooltip (for future use)
  includeFields?: string[];    // whitelist specific fields for this section only
  excludeFields?: string[];    // blacklist specific fields from this section only
}
```

**`Field` shape:**

```ts
interface Field {
  label:        string;     // "First Name"
  value:        JsonValue;  // "Alice"
  path:         string;     // "customer.firstName"
  key:          string;     // "firstName"
  type:         FieldType;  // "primitive" | "array" | "object" | "null"
  description?: string;     // tooltip text, if provided via config.descriptions
}
```

**`Section` shape:**

```ts
interface Section {
  title:       string;
  fields:      readonly Field[];
  subsections: readonly Section[];
  path:        string;     // "customer" or "customer.address"
}
```

**`NormalizationResult`:**

```ts
interface NormalizationResult {
  sections:        readonly Section[];
  totalFields:     number;           // count of all Field instances across all sections
  processedPaths:  readonly string[]; // all dot-notation paths that were processed
}
```

---

### `flattenSectionsToFields(sections)`

Flattens a section tree depth-first into a single ordered array of all `Field` instances. Section fields come before their subsection fields.

```ts
import { flattenSectionsToFields } from '@heyblank-labs/json-flux';

const { sections } = normalizeToSections({
  user: {
    name: 'Alice',
    address: { city: 'London', zip: 'SW1A 1AA' },
  },
});

flattenSectionsToFields(sections);
// → [
//   { label: "Name", value: "Alice",   path: "user.name",          type: "primitive" },
//   { label: "City", value: "London", path: "user.address.city",  type: "primitive" },
//   { label: "Zip",  value: "SW1A 1AA",  path: "user.address.zip",   type: "primitive" },
// ]
```

Use this for:
- Simple list-based detail views
- CSV / spreadsheet exports
- Search/filter across all fields regardless of section grouping

---

### `mergeSections(a, b)`

Merges two section arrays by title. Sections with matching titles have their `fields` and `subsections` combined. Non-matching sections from both arrays are preserved.

```ts
import { mergeSections } from '@heyblank-labs/json-flux';

const { sections: fromApi1 } = normalizeToSections({ user: { name: 'Alice' } });
const { sections: fromApi2 } = normalizeToSections({ user: { age: 30 }, meta: { id: 1 } });

mergeSections(fromApi1, fromApi2);
// → [
//   { title: "User", fields: [name field, age field], ... },
//   { title: "Meta", fields: [id field], ... },
// ]
```

---

### Built-in Dictionary

`toDisplayLabel`, `humanize`, and `normalizeToSections` all automatically resolve common abbreviations via the built-in dictionary. No configuration required.

| Key | Label | Key | Label | Key | Label |
|---|---|---|---|---|---|
| `id` | ID | `dob` | Date of Birth | `ssn` | SSN |
| `api` | API | `url` | URL | `uri` | URI |
| `http` | HTTP | `https` | HTTPS | `html` | HTML |
| `css` | CSS | `json` | JSON | `xml` | XML |
| `jwt` | JWT | `mfa` | MFA | `otp` | OTP |
| `sso` | SSO | `oauth` | OAuth | `ip` | IP |
| `iban` | IBAN | `bic` | BIC | `swift` | SWIFT |
| `sku` | SKU | `qty` | Quantity | `amt` | Amount |
| `ref` | Reference | `desc` | Description | `cfg` | Configuration |
| `zip` | ZIP Code | `doa` | Date of Admission | `eta` | ETA |
| `crm` | CRM | `erp` | ERP | `kpi` | KPI |
| `roi` | ROI | `gst` | GST | `vat` | VAT |

**Override any entry:**

```ts
// Single key override
toDisplayLabel('dob', { dictionary: { dob: 'Birthday' } }) // → "Birthday"

// Global override via humanize
humanize(data, { labels: { dob: 'Birthday' } })

// Section-level override
normalizeToSections(data, { labels: { dob: 'Birthday' } })
```

**Access the dictionary directly:**

```ts
import { BUILT_IN_DICTIONARY, lookupDictionary } from '@heyblank-labs/json-flux';

BUILT_IN_DICTIONARY['dob']  // → "Date of Birth"
lookupDictionary('id')      // → "ID"
lookupDictionary('DOB')     // → "Date of Birth"  (case-insensitive)
lookupDictionary('dob', { dob: 'Birthday' }) // → "Birthday"  (custom wins)
```

---

### String Utilities (Advanced)

Low-level string primitives exposed for custom label pipelines and plugin authors.

```ts
import {
  tokenize,
  toTitleCase,
  toSentenceCase,
  looksLikeAcronym,
  lastSegment,
  unescapeKey,
} from '@heyblank-labs/json-flux';
```

#### `tokenize(key)`

Splits an identifier into raw tokens handling all conventions:

```ts
tokenize('firstName')       // → ['first', 'Name']
tokenize('user_id')         // → ['user', 'id']
tokenize('FIRST_NAME')      // → ['FIRST', 'NAME']
tokenize('XMLParser')       // → ['XML', 'Parser']
tokenize('getHTTPResponse') // → ['get', 'HTTP', 'Response']
tokenize('level2Cache')     // → ['level', '2', 'Cache']
```

#### `toTitleCase(tokens, isKnownAcronym?)`

Applies Title Case, preserving acronyms:

```ts
toTitleCase(['first', 'name'])  // → "First Name"
toTitleCase(['user', 'ID'])     // → "User ID"
```

#### `toSentenceCase(tokens, isKnownAcronym?)`

Applies Sentence case, preserving acronyms mid-sentence:

```ts
toSentenceCase(['user', 'ID', 'reference'])  // → "User ID reference"
```

#### `looksLikeAcronym(token)`

```ts
looksLikeAcronym('ID')    // → true
looksLikeAcronym('API')   // → true
looksLikeAcronym('Name')  // → false
```

#### `lastSegment(path, delimiter?)`

```ts
lastSegment('user.address.city')  // → "city"
lastSegment('a>b>c', '>')         // → "c"
```

#### `unescapeKey(key)`

Strips bracket escaping from the flatten layer:

```ts
unescapeKey('[a.b]')  // → "a.b"
unescapeKey('name')   // → "name"
```

---

---

## v0.3.0 — Filtering & Visibility

> Released · Fine-grained control over which fields appear in your JSON — by key name, dot-notation path, wildcard pattern, predicate function, or emptiness rules.

---

### `excludeKeys(obj, keys, options?)`

Removes specified keys from a JSON object. Supports bare key names, exact dot-notation paths, single-wildcard `*`, double-star glob `**`, and array-index wildcards `[*]`.

**Pattern syntax:**

| Pattern | Matches |
|---|---|
| `"password"` | The key `password` at any depth |
| `"user.address.zip"` | Exactly that dot-notation path |
| `"user.*.secret"` | One intermediate segment: `user.profile.secret`, `user.address.secret` |
| `"**.token"` | Any path ending in `token` at any depth |
| `"users[*].ssn"` | `ssn` inside any element of the `users` array |

```ts
import { excludeKeys, excludeKeysDirect } from '@heyblank-labs/json-flux';

// ── Bare key — removes at any depth ──────────────────────────────────────────
excludeKeysDirect(
  { user: { name: "Alice", password: "secret", profile: { password: "hash" } } },
  ["password"]
)
// → { user: { name: "Alice", profile: {} } }

// ── Exact dot path ────────────────────────────────────────────────────────────
excludeKeysDirect(
  { user: { address: { city: "London", zip: "SW1A 1AA" } } },
  ["user.address.zip"]
)
// → { user: { address: { city: "London" } } }

// ── Double-star glob — all depths ─────────────────────────────────────────────
excludeKeysDirect(
  { user: { token: "a", profile: { token: "b", nested: { token: "c" } } } },
  ["**.token"]
)
// → { user: { profile: { nested: {} } } }

// ── Array wildcard ────────────────────────────────────────────────────────────
excludeKeysDirect(
  { users: [{ name: "Alice", ssn: "111" }, { name: "Bob", ssn: "222" }] },
  ["users[*].ssn"]
)
// → { users: [{ name: "Alice" }, { name: "Bob" }] }

// ── Multiple patterns ─────────────────────────────────────────────────────────
excludeKeysDirect(apiResponse, ["**.password", "**.token", "**.internalId"])
```

**With metadata (full result):**

```ts
const { data, removedCount, removedPaths } = excludeKeys(obj, ["**.password"]);
// removedCount → 3
// removedPaths → ["user.password", "user.profile.password", "admin.password"]
```

**`ExcludeOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `deep` | `boolean` | `true` | Recurse into nested objects and arrays |
| `maxDepth` | `number` | `20` | Recursion depth limit |
| `caseInsensitive` | `boolean` | `false` | Case-insensitive key/pattern matching |

---

### `includeKeys(obj, keys, options?)`

Keeps only the specified keys, removing everything else. All ancestor paths of an included key are automatically preserved to maintain a valid object structure.

```ts
import { includeKeys, includeKeysDirect } from '@heyblank-labs/json-flux';

// ── Bare keys — match at any depth ───────────────────────────────────────────
includeKeysDirect(
  { user: { name: "Alice", age: 30, secret: "x" }, meta: { name: "doc" } },
  ["name"]
)
// → { user: { name: "Alice" }, meta: { name: "doc" } }

// ── Exact dot paths ───────────────────────────────────────────────────────────
includeKeysDirect(
  { user: { name: "Alice", password: "x", address: { city: "London" } }, meta: { id: 1 } },
  ["user.name", "user.address.city"]
)
// → { user: { name: "Alice", address: { city: "London" } } }
// meta removed — not in include list

// ── Entire subtree kept when path points to an object ────────────────────────
includeKeysDirect(
  { user: { profile: { name: "Alice", bio: "Dev" }, secret: "x" } },
  ["user.profile"]
)
// → { user: { profile: { name: "Alice", bio: "Dev" } } }

// ── Array wildcard ────────────────────────────────────────────────────────────
includeKeysDirect(
  { users: [{ id: 1, name: "Alice", token: "a" }, { id: 2, name: "Bob", token: "b" }] },
  ["users[*].id", "users[*].name"]
)
// → { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] }
```

> **Important:** For fine-grained sibling exclusion within objects containing glob patterns (`**.id`), prefer explicit dot paths or combine `includeKeys` with `excludeKeys`. Deep glob patterns (`**.id`) treat all intermediate objects as potential ancestors since any nested object could contain `id`.

**`IncludeOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `deep` | `boolean` | `true` | Recurse into nested objects and arrays |
| `maxDepth` | `number` | `20` | Recursion depth limit |
| `caseInsensitive` | `boolean` | `false` | Case-insensitive key/pattern matching |

---

### `hideIf(obj, predicate, options?)`

Conditionally removes fields based on a predicate function. The predicate receives full context — value, key, and dot-notation path — enabling any filtering logic you can express.

```ts
import { hideIf, hideIfDirect } from '@heyblank-labs/json-flux';

// ── Remove by value ───────────────────────────────────────────────────────────
hideIfDirect(obj, (value) => value === null)
hideIfDirect(obj, (value) => typeof value === "number" && value < 0)
hideIfDirect(obj, (value) => Array.isArray(value) && value.length === 0)

// ── Remove by key convention ──────────────────────────────────────────────────
hideIfDirect(obj, (_value, key) => key.startsWith("_"))         // private fields
hideIfDirect(obj, (_value, key) => key.endsWith("Internal"))    // internal fields

// ── Remove by path ────────────────────────────────────────────────────────────
hideIfDirect(obj, (_value, _key, path) => path.startsWith("debug."))
hideIfDirect(obj, (_value, _key, path) => path.includes(".internal."))

// ── Complex: remove fields where key starts with _ OR value is null ───────────
hideIfDirect(obj, (value, key) => key.startsWith("_") || value === null)

// ── Real-world example: clean API response for UI ─────────────────────────────
const cleaned = hideIfDirect(apiResponse, (value, key, path) => {
  if (key.startsWith("_")) return true;            // private convention
  if (path.includes(".audit.")) return true;       // audit trail fields
  if (value === null || value === "") return true; // empty values
  return false;
});
```

**With metadata:**

```ts
const { data, removedCount, removedPaths } = hideIf(
  { name: "Alice", _id: "x", age: null },
  (value, key) => key.startsWith("_") || value === null
);
// removedCount → 2
// removedPaths → ["_id", "age"]
```

**`HideIfOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `deep` | `boolean` | `true` | Recurse into nested objects and arrays |
| `maxDepth` | `number` | `20` | Recursion depth limit |
| `removeEmptyParents` | `boolean` | `true` | Remove parent objects that become empty after child removal |

---

### `stripEmpty(obj, options?)`

Removes "empty" values recursively. More configurable than `removeNulls` (v0.1.0) — with explicit control over what counts as empty, tracking of removed paths, and removal of empty arrays by default.

```ts
import { stripEmpty, stripEmptyDirect } from '@heyblank-labs/json-flux';

stripEmptyDirect({
  name: "Alice",
  age: null,
  bio: "",
  score: 0,
  active: false,
  tags: [],
  address: {},
})
// → { name: "Alice", score: 0, active: false }
// Removed: null, "", [], {}
// Kept: 0 and false (preserved by default)

// ── Keep empty arrays ─────────────────────────────────────────────────────────
stripEmptyDirect(obj, { preserveEmptyArrays: true })

// ── Also remove 0 and false ───────────────────────────────────────────────────
stripEmptyDirect(obj, { preserveZero: false, preserveFalse: false })

// ── Keep empty strings ────────────────────────────────────────────────────────
stripEmptyDirect(obj, { preserveEmptyStrings: true })
```

**`StripEmptyOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `preserveFalse` | `boolean` | `true` | Keep `false` boolean values |
| `preserveZero` | `boolean` | `true` | Keep `0` numeric values |
| `preserveEmptyStrings` | `boolean` | `false` | Keep `""` empty strings |
| `preserveEmptyArrays` | `boolean` | `false` | Keep `[]` empty arrays |
| `preserveEmptyObjects` | `boolean` | `false` | Keep `{}` empty objects |
| `deep` | `boolean` | `true` | Recurse into nested objects and arrays |
| `maxDepth` | `number` | `20` | Recursion depth limit |

> **vs `removeNulls` (v0.1.0):** `stripEmpty` removes empty arrays and objects by default, tracks removed paths, and is more granularly configurable. `removeNulls` only removes empty objects by default and keeps empty arrays.

---

### Built-in Predicates

Convenience predicates exported for use with `hideIf`:

```ts
import {
  isNull,        // value === null
  isNullish,     // value === null || value === undefined
  isEmptyString, // value === ""
  isEmptyArray,  // Array.isArray(value) && value.length === 0
  isEmptyObject, // isPlainObject(value) && Object.keys(value).length === 0
  isFalsy,       // !value  (catches null, undefined, false, 0, "")
} from '@heyblank-labs/json-flux';

// Use directly
hideIfDirect(obj, isNull)
hideIfDirect(obj, isNullish)
hideIfDirect(obj, isFalsy)

// Compose
hideIfDirect(obj, (value, key) => isNull(value, key, "") || key.startsWith("_"))
```

---

### Path Matching Engine

The internal path matcher is also exported for advanced use cases — building custom filters, validating user-provided paths, or building plugin pipelines.

```ts
import { compileMatcher, compileMatchers, anyMatcherMatches } from '@heyblank-labs/json-flux';
```

#### `compileMatcher(pattern, options?)`

Compiles a single pattern into a reusable `PathMatcher`. Pre-parsing makes repeated matching O(1) per node.

```ts
const m = compileMatcher("user.*.secret");
m.matches("user.address.secret")  // → true
m.matches("user.secret")          // → false  (* requires exactly one segment)
m.pattern                         // → "user.*.secret"
m.isGlob                          // → true

const exact = compileMatcher("user.name");
exact.matches("user.name")        // → true
exact.matches("user.email")       // → false
exact.isGlob                      // → false
```

**Pattern reference:**

| Pattern | Description | Example matches |
|---|---|---|
| `"user.name"` | Exact path | `user.name` only |
| `"*.name"` | One-level wildcard | `user.name`, `admin.name` |
| `"**.name"` | Deep glob (any depth) | `name`, `a.name`, `a.b.c.name` |
| `"users[*].email"` | Array index wildcard | `users.0.email`, `users.99.email` |
| `"user.**.id"` | Deep glob in middle | `user.id`, `user.profile.id`, `user.a.b.id` |
| `"**"` | Matches everything | Any path at any depth |

> Patterns containing `__proto__`, `prototype`, or `constructor` throw an error immediately at compile time.

#### `compileMatchers(patterns, options?)`

Compiles multiple patterns, silently skipping any invalid ones:

```ts
const matchers = compileMatchers(["**.password", "**.token", "**.ssn"]);
```

#### `anyMatcherMatches(matchers, path)`

Tests a path against an array of compiled matchers. Short-circuits on first match:

```ts
anyMatcherMatches(matchers, "user.password")  // → true
anyMatcherMatches(matchers, "user.name")      // → false
```

---

### Path Utilities (Advanced)

Low-level path helpers exposed for plugin authors and custom filter pipelines:

```ts
import {
  splitPath,
  joinPath,
  parentPath,
  leafKey,
  isValidPath,
  pathContainsUnsafeKey,
} from '@heyblank-labs/json-flux';
```

```ts
splitPath("users[0].address.city")  // → ["users", 0, "address", "city"]
splitPath("a.b.c")                  // → ["a", "b", "c"]

joinPath("user", "address")         // → "user.address"
joinPath("", "name")                // → "name"
joinPath("items", 0)                // → "items.0"

parentPath("user.address.city")     // → "user.address"
parentPath("user")                  // → ""

leafKey("user.address.city")        // → "city"

isValidPath("user.name")            // → true
isValidPath("__proto__")            // → false
isValidPath("")                     // → false

pathContainsUnsafeKey("user.__proto__.x") // → true
pathContainsUnsafeKey("user.address")     // → false
```

---

### Composing Filters

All filter functions return plain data — chain them freely:

```ts
import {
  deepSafeParse, removeNulls,
  excludeKeys, includeKeys, hideIf, stripEmpty,
  normalizeToSections, flattenSectionsToFields,
} from '@heyblank-labs/json-flux';

// Full pipeline: parse → clean → filter → humanize → sections
const raw = await fetch('/api/customer').then(r => r.json());

const result = normalizeToSections(
  hideIfDirect(
    excludeKeysDirect(
      stripEmptyDirect(deepSafeParse(raw)),
      ["**.internalId", "**.auditLog", "**.rawPayload"]
    ),
    (_value, key) => key.startsWith("_")
  ),
  {
    sectionMap: { customer: "Customer Details", address: "Shipping Address" },
    labels: { dob: "Date of Birth" },
  }
);
```

**`FilterResult<T>` — returned by all filter functions (non-direct variants):**

```ts
interface FilterResult<T> {
  data: T;                          // the filtered value
  removedCount: number;             // total fields removed
  removedPaths: readonly string[];  // dot-notation paths of removed fields
}
```

---

## TypeScript Types

All types are exported and fully documented. Import exactly what you need:

```ts
import type {
  // ── v0.1.0 Core types ────────────────────────────────────
  JsonPrimitive,       // string | number | boolean | null
  JsonObject,          // { [key: string]: JsonValue }
  JsonArray,           // JsonValue[]
  JsonValue,           // JsonPrimitive | JsonObject | JsonArray
  FlatRecord,          // Record<string, JsonPrimitive>
  FlattenOptions,
  FlattenResult,
  FlattenArrayResult,
  RemoveNullsOptions,
  SafeParseOptions,
  CollectKeysOptions,
  CollectKeysResult,
  ExtractOptions,

  // ── v0.2.0 Labels & Sections types ───────────────────────
  FieldType,           // "primitive" | "array" | "object" | "null"
  Field,
  Section,
  CaseStyle,           // "title" | "sentence"
  LabelOptions,
  HumanizeOptions,
  SectionMapping,
  SectionConfig,
  NormalizationResult,

  // ── v0.3.0 Filtering types ────────────────────────────────
  FilterPredicate,     // (value, key, path) => boolean
  BaseFilterOptions,
  ExcludeOptions,
  IncludeOptions,
  HideIfOptions,
  StripEmptyOptions,
  PathMatcher,
  PathMatcherOptions,
  FilterResult,        // { data: T, removedCount: number, removedPaths: string[] }
} from '@heyblank-labs/json-flux';
```

---

## Edge Cases & Gotchas

| Scenario | Behaviour |
|---|---|
| Circular references | Replaced with `"[Circular]"` sentinel — never throws anywhere in the library |
| `__proto__` / `prototype` / `constructor` keys | Silently dropped at every layer (parse, flatten, humanize, sections) |
| `null` values | Excluded from sections by default; set `includeNulls: true` to keep them; always removed by `removeNulls` |
| `0` and `false` | Always preserved — treated as valid values, never removed |
| `""` (empty string) | Removed by `removeNulls` by default; configure with `removeEmptyStrings: false` |
| Empty objects `{}` | Removed by `removeNulls` by default after cleaning child keys |
| Empty arrays `[]` | Stored as `null` in flat records; optionally removed by `removeNulls` with `removeEmptyArrays: true` |
| Double-serialized JSON | Unwrapped automatically by `deepSafeParse` — handles up to 10 nesting levels |
| Malformed JSON strings | Returned as-is — never throws |
| Keys containing the delimiter | Auto-escaped as `[key]` in dot-notation paths to avoid ambiguity |
| `SCREAMING_SNAKE_CASE` | `FIRST_NAME` → `"First Name"` (words longer than 3 chars are title-cased) |
| Mixed acronyms in keys | `XMLParser` → `"XML Parser"`, `getHTTPResponse` → `"Get HTTP Response"` |
| Array input to `normalizeToSections` | Each plain-object item becomes a top-level section; non-objects are skipped |

---

## Security

`@heyblank-labs/json-flux` is designed with security as a first-class concern across every function:

- **No `eval`** or dynamic code execution anywhere in the library
- **Prototype pollution prevention** — `__proto__`, `prototype`, and `constructor` are blocked in every traversal, parse, flatten, humanize, and extraction function
- **No mutation** — all functions are pure; input objects are never modified
- **Frozen outputs** — all results are wrapped with `Object.freeze` so they cannot be accidentally mutated downstream
- **Input validation** — malformed inputs always return safe fallbacks without throwing
- **WeakSet cycle detection** — circular references never cause stack overflows

---

## Performance

All traversals are O(n) in the number of nodes.

| Operation | Dataset | Time |
|---|---|---|
| `flattenObject` | 10,000 nodes | < 200ms |
| `flattenArray` | 1,000 rows | < 500ms |
| `removeNulls` | 5,000 keys | < 100ms |
| `toDisplayLabel` | repeated calls | O(1) — memoised |
| `normalizeToSections` | 500-field payload | < 50ms |

**Label memoisation:** `toDisplayLabel` caches results in an LRU cache (2,000 entries, keyed by key + options fingerprint). Repeated calls for the same key are O(1) with zero re-processing.

**`WeakSet` cycle detection:** adds O(1) per node — no performance cliff on large graphs.

**Immutable outputs:** all public functions return `Object.freeze`-d results — safe to cache and share without defensive copying.

---

## Framework Adapters

`@heyblank-labs/json-flux` outputs plain data objects with zero framework dependencies. Drop it into any stack:

**Angular service:**

```ts
import { Injectable } from '@angular/core';
import { deepSafeParse, removeNulls, normalizeToSections } from '@heyblank-labs/json-flux';
import type { SectionConfig, NormalizationResult } from '@heyblank-labs/json-flux';

@Injectable({ providedIn: 'root' })
export class JsonTransformService {
  normalize(raw: unknown, config?: SectionConfig): NormalizationResult {
    const parsed  = deepSafeParse(raw);
    const cleaned = removeNulls(parsed);
    return normalizeToSections(cleaned, config);
  }
}
```

**React hook:**

```ts
import { useMemo } from 'react';
import { deepSafeParse, removeNulls, normalizeToSections } from '@heyblank-labs/json-flux';
import type { SectionConfig } from '@heyblank-labs/json-flux';

function useJsonSections(raw: unknown, config?: SectionConfig) {
  return useMemo(() => {
    const cleaned = removeNulls(deepSafeParse(raw));
    return normalizeToSections(cleaned, config);
  }, [raw, config]);
}

// Usage
const { sections, totalFields } = useJsonSections(apiResponse, {
  sectionMap: { user: 'User Details' },
  labels: { dob: 'Date of Birth' },
});
```

**Vue composable:**

```ts
import { computed, type Ref } from 'vue';
import { deepSafeParse, removeNulls, normalizeToSections } from '@heyblank-labs/json-flux';
import type { SectionConfig } from '@heyblank-labs/json-flux';

export function useJsonSections(raw: Ref<unknown>, config?: SectionConfig) {
  return computed(() => {
    const cleaned = removeNulls(deepSafeParse(raw.value));
    return normalizeToSections(cleaned, config);
  });
}
```

---

## Distribution

| Format | File | Use for |
|---|---|---|
| ESM | `dist/index.js` | Bundlers (Vite, webpack, esbuild), modern Node.js |
| CommonJS | `dist/index.cjs` | Legacy Node.js, Jest without ESM config |
| Type definitions | `dist/index.d.ts` | TypeScript — included automatically |

Compatible with **Node.js ≥ 16**, all modern browsers, and SSR environments (Next.js, Nuxt, SvelteKit, Astro).

---

## License

MIT © heyblank-labs
