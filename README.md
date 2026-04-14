# JSON Flux

> **Flow, shape, and transform JSON effortlessly.**

A lightweight, TypeScript-first, framework-agnostic utility library for safely processing deeply nested JSON structures. Zero runtime dependencies. Tree-shakable. Runs anywhere — Node.js, browser, SSR.

[![npm version](https://img.shields.io/npm/v/@heyblank-labs/json-flux)](https://www.npmjs.com/package/@heyblank-labs/json-flux)
[![license](https://img.shields.io/npm/l/@heyblank-labs/json-flux)](./LICENSE)
[![test](https://img.shields.io/badge/tests-108%20passing-brightgreen)]()
[![coverage](https://img.shields.io/badge/coverage->90%25-brightgreen)]()

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
import { deepSafeParse, removeNulls, flattenObject, extractField } from '@heyblank-labs/json-flux';

// 1. Parse double-serialized API response safely
const parsed = deepSafeParse(rawApiResponse);

// 2. Strip all null/undefined/empty values
const cleaned = removeNulls(parsed);

// 3. Flatten to dot-notation for table rendering
const { data } = flattenObject(cleaned);
// → { "user.name": "Alice", "user.address.city": "London", ... }

// 4. Extract a specific field safely
const city = extractField(cleaned, 'user.address[0].city', { defaultValue: 'N/A' });
// → "London"
```

---

## API Reference

### `flattenObject(obj, options?)`

Converts a deeply nested object into a flat record of dot-notation paths.

```ts
import { flattenObject } from '@heyblank-labs/json-flux';

const { data, leafCount, arrayObjectPaths } = flattenObject({
  user: { name: 'Alice', age: 30 },
  tags: ['ts', 'json'],
  items: [{ id: 1 }, { id: 2 }],
});

// data → {
//   "user.name": "Alice",
//   "user.age": 30,
//   "tags": "ts, json",          // primitive arrays → joined string
//   "items": "[{\"id\":1},...]"  // object arrays → JSON string
// }
// arrayObjectPaths → ["items"]
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `delimiter` | `string` | `"."` | Key separator |
| `maxDepth` | `number` | `20` | Max recursion depth |
| `skipArrays` | `boolean` | `false` | Store arrays as JSON strings without traversing |
| `excludeKeys` | `string[]` | `[]` | Keys to skip entirely |

**Returns:** `FlattenResult`
```ts
{
  data: FlatRecord;            // The flat key→value record
  leafCount: number;           // Total leaf nodes written
  maxDepthReached: number;     // Deepest level reached
  arrayObjectPaths: string[];  // Paths that held arrays of objects
}
```

> **Safety:** Circular references are detected via `WeakSet` and replaced with `"[Circular]"`. Prototype-pollution keys (`__proto__`, `prototype`, `constructor`) are silently dropped.

---

### `flattenArray(arr, options?, omitIndexPrefix?)`

Flattens an array of objects into an array of flat records.

```ts
import { flattenArray } from '@heyblank-labs/json-flux';

const { rows, allKeys, arrayObjectPaths, skippedCount } = flattenArray([
  { name: 'Alice', role: 'admin' },
  { name: 'Bob',   role: 'user'  },
]);

// rows → [
//   { "name": "Alice", "role": "admin" },
//   { "name": "Bob",   "role": "user"  },
// ]
// allKeys → ["name", "role"]
```

Set `omitIndexPrefix` to `false` to prefix each key with its row index (`"0.name"`, `"1.name"`, etc.).

---

### `removeNulls(value, options?)`

Recursively removes `null`, `undefined`, empty strings, and optionally empty arrays/objects. Returns a new structure — never mutates input.

```ts
import { removeNulls } from '@heyblank-labs/json-flux';

removeNulls({
  name: 'Alice',
  age: null,
  address: { city: 'London', zip: '' },
  tags: [null, 'ts', null],
});
// → { name: 'Alice', address: { city: 'London' }, tags: ['ts'] }
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `removeEmptyStrings` | `boolean` | `true` | Remove `""` values |
| `removeEmptyArrays` | `boolean` | `false` | Remove `[]` values |
| `removeEmptyObjects` | `boolean` | `true` | Remove `{}` after cleaning |
| `maxDepth` | `number` | `20` | Recursion guard |

---

### `deepSafeParse(input, options?)`

Recursively parses a value that may contain stringified JSON — including double/triple-serialized responses common in enterprise APIs.

```ts
import { deepSafeParse } from '@heyblank-labs/json-flux';

// Double-serialized API response
const raw = '"{\\"user\\":{\\"name\\":\\"Alice\\"}}"';
deepSafeParse(raw);
// → { user: { name: 'Alice' } }

// Object with nested JSON strings
deepSafeParse({ payload: '{"status":"ok"}' });
// → { payload: { status: 'ok' } }
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `maxIterations` | `number` | `10` | Max unwrapping passes per value |
| `maxDepth` | `number` | `20` | Recursion depth guard |
| `throwOnPollution` | `boolean` | `false` | Throw instead of silently drop on unsafe keys |

> **Security:** `__proto__`, `prototype`, and `constructor` keys are stripped from every parsed object. `JSON.parse` is used — no `eval`.

---

### `safeParse(value, options?)`

Single-level variant of `deepSafeParse`. Unwraps a single stringified JSON value iteratively.

```ts
import { safeParse } from '@heyblank-labs/json-flux';

safeParse(42);                    // → 42   (non-strings returned as-is)
safeParse('{"a":1}');             // → { a: 1 }
safeParse('"not json"');          // → "not json"
safeParse('{bad json}');          // → "{bad json}"  (no throw)
```

---

### `collectAllKeys(input, options?)`

Collects every unique key across a deeply nested structure.

```ts
import { collectAllKeys } from '@heyblank-labs/json-flux';

const { keys, totalNodes } = collectAllKeys({
  user: { name: 'Alice', role: 'admin' },
  active: true,
});
// keys → ['user', 'name', 'role', 'active']
// totalNodes → 4

// With dot-notation paths:
collectAllKeys({ user: { name: 'Alice' } }, { dotNotation: true });
// keys → ['user', 'user.name']
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `dotNotation` | `boolean` | `false` | Return full paths instead of bare keys |
| `delimiter` | `string` | `"."` | Path delimiter |
| `maxDepth` | `number` | `20` | Recursion depth guard |

---

### `extractField(obj, path, options?)`

Safe getter using dot-notation and bracket-notation paths. Never throws.

```ts
import { extractField } from '@heyblank-labs/json-flux';

const data = {
  users: [
    { id: 1, address: { city: 'London' } },
    { id: 2, address: { city: 'Mumbai'  } },
  ],
};

extractField(data, 'users[0].address.city');   // → "London"
extractField(data, 'users[1].id');             // → 2
extractField(data, 'users[99].id');            // → undefined
extractField(data, 'missing.path', { defaultValue: 'N/A' }); // → "N/A"
```

**Supported path formats:**
- Dot notation: `user.address.city`
- Array indexing: `items[0].name`
- Mixed: `data[0].items[2].label`
- Bracket string keys: `map[someKey].value`

---

### `hasField(obj, path)`

Checks whether a path exists. Returns `true` even when the value at that path is `null`.

```ts
import { hasField } from '@heyblank-labs/json-flux';

hasField({ a: { b: null } }, 'a.b');  // → true
hasField({ a: 1 },           'a.b');  // → false
```

---

### `collectRowKeys(rows)`

Collects the union of all keys across an array of flat records. Useful for building dynamic table column definitions.

```ts
import { collectRowKeys } from '@heyblank-labs/json-flux';

collectRowKeys([{ a: 1, b: 2 }, { b: 3, c: 4 }]);
// → ["a", "b", "c"]
```

---

### `isEmpty(value)`

Returns `true` for `null`, `undefined`, `""`, `[]`, and `{}`.

```ts
import { isEmpty } from '@heyblank-labs/json-flux';

isEmpty(null);   // true
isEmpty([]);     // true
isEmpty({});     // true
isEmpty(0);      // false  ← zero is a valid value
isEmpty(false);  // false  ← false is a valid value
```

---

### Helpers

```ts
import { deepMerge, deepEqual, deepClone, omitKeys, pickKeys, toSafeString } from '@heyblank-labs/json-flux';

deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 });
// → { a: { x: 1, y: 2 }, b: 3 }

deepEqual({ a: [1, 2] }, { a: [1, 2] });   // → true

omitKeys({ a: 1, b: 2, c: 3 }, ['b']);     // → { a: 1, c: 3 }
pickKeys({ a: 1, b: 2, c: 3 }, ['a', 'c']); // → { a: 1, c: 3 }

toSafeString(null);         // → ""
toSafeString({ id: 1 });   // → '{"id":1}'
```

---

## Edge Cases & Gotchas

| Scenario | Behaviour |
|---|---|
| Circular references | Replaced with `"[Circular]"` sentinel — never throws |
| `__proto__` / `constructor` keys | Silently dropped everywhere in the pipeline |
| Empty arrays | Stored as `null` in flat records; filtered by `removeNulls` when `removeEmptyArrays: true` |
| Double-serialized JSON | Unwrapped automatically by `deepSafeParse` / `safeParse` |
| `0` and `false` | Always preserved — only `null`/`undefined`/`""` are removed |
| Keys containing the delimiter | Auto-escaped as `[key]` in dot-notation paths |
| Malformed JSON strings | Returned as-is without throwing |

---

## Performance Notes

- All traversals are O(n) in the number of nodes.
- `WeakSet`-based cycle detection adds O(1) per node — no performance cliff on large graphs.
- `flattenObject` on a 10 000-node structure completes in under 200ms.
- `flattenArray` on 1 000 rows completes in under 500ms.
- All public functions return frozen, immutable results — safe to cache without defensive copying.

---

## Security

@heyblank-labs/json-flux is designed with security as a first-class concern:

- **No `eval`** or dynamic code execution anywhere.
- **Prototype pollution prevention** — `__proto__`, `prototype`, and `constructor` are blocked in every traversal, parse, and extraction function.
- **No mutation** — all functions are pure. Input objects are never modified.
- **Input validation** — all inputs are validated before processing; malformed inputs return safe fallbacks.

---

## Distribution

| Format | File |
|---|---|
| ESM | `dist/index.js` |
| CommonJS | `dist/index.cjs` |
| Type definitions | `dist/index.d.ts` |

Compatible with Node.js ≥ 16, all modern browsers, and SSR environments (Next.js, Nuxt, SvelteKit).

---

## License

MIT
