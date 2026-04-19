// =============================================================================
// query/builder.ts
// Fluent LINQ-style query builder for JSON arrays.
// =============================================================================

import type {
  WherePredicate,
  KeySelector,
  Projector,
  GroupResult,
  WhereOperator,
} from "../types/query.types.js";
import { compilePathPredicate } from "./where.js";
import {
  groupBy as aggregateGroupBy,
  sum as aggregateSum,
  avg as aggregateAvg,
  min as aggregateMin,
  max as aggregateMax,
  distinct as aggregateDistinct,
} from "./aggregate.js";
import { search } from "./search.js";
import { extractField } from "../core/extract.js";
import type { SearchOptions } from "../types/query.types.js";

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

type Step<T, R> =
  | { kind: "where";      predicate: WherePredicate<T> }
  | { kind: "select";     projector: Projector<T, R> }
  | { kind: "selectMany"; projector: (item: T) => R[] }
  | { kind: "orderBy";    selector: KeySelector<T, unknown>; desc: boolean }
  | { kind: "take";       n: number }
  | { kind: "skip";       n: number };

// ---------------------------------------------------------------------------
// Safe wrapper helpers
// ---------------------------------------------------------------------------

function safeCall<T, R>(fn: (item: T) => R, item: T, fallback: R): R {
  try { return fn(item); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// QueryBuilder
// ---------------------------------------------------------------------------

/**
 * A lazy, chainable query builder for arrays of type T.
 * Materialise the result using .toArray(), .count(), .first() etc.
 *
 * @example
 * from([
 *   { name: "Alice", age: 30, country: "IN" },
 *   { name: "Bob",   age: 22, country: "US" },
 * ])
 * .where(x => x.age > 25)
 * .select(x => ({ name: x.name }))
 * .toArray()
 * // → [{ name: "Alice" }]
 */
export class QueryBuilder<T, R = T> {
  /** @internal */
  private readonly _source: readonly T[];
  /** @internal */
  private readonly _steps: ReadonlyArray<Step<unknown, unknown>>;

  constructor(source: readonly T[], steps: ReadonlyArray<Step<unknown, unknown>> = []) {
    this._source = source;
    this._steps = steps;
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  /**
   * Filter items using a predicate function or path-operator-value triple.
   *
   * @example
   * .where(x => x.age > 25)
   * .where("age", ">", 25)
   * .where("status", "in", ["ACTIVE", "PENDING"])
   */
  where(predicate: WherePredicate<R>): QueryBuilder<T, R>;
  where(path: string, op: WhereOperator, value: unknown): QueryBuilder<T, R>;
  where(
    predicateOrPath: WherePredicate<R> | string,
    op?: WhereOperator,
    value?: unknown
  ): QueryBuilder<T, R> {
    let pred: WherePredicate<unknown>;

    if (typeof predicateOrPath === "function") {
      pred = predicateOrPath as WherePredicate<unknown>;
    } else {
      pred = compilePathPredicate(predicateOrPath, op ?? "eq", value);
    }

    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "where", predicate: pred }]
    );
  }

  // ── Projection ────────────────────────────────────────────────────────────

  /**
   * Projects each item to a new shape.
   *
   * @example
   * .select(x => ({ name: x.user.name, age: x.user.age }))
   * .select(["user.name", "user.age"])  // returns pick of paths
   */
  select<U>(projector: Projector<R, U>): QueryBuilder<T, U>;
  select(paths: string[]): QueryBuilder<T, Record<string, unknown>>;
  select<U>(
    projectorOrPaths: Projector<R, U> | string[]
  ): QueryBuilder<T, U> | QueryBuilder<T, Record<string, unknown>> {
    if (typeof projectorOrPaths === "function") {
      return new QueryBuilder<T, U>(
        this._source,
        [...this._steps, { kind: "select", projector: projectorOrPaths as Projector<unknown, unknown> }]
      );
    }

    // Path-based select
    const paths = projectorOrPaths;
    const projector = (item: R): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const p of paths) {
        result[p] = extractField(item as Record<string, unknown>, p);
      }
      return result;
    };

    return new QueryBuilder<T, Record<string, unknown>>(
      this._source,
      [...this._steps, { kind: "select", projector: projector as Projector<unknown, unknown> }]
    );
  }

  /**
   * Flattens nested arrays.
   *
   * @example
   * .selectMany(x => x.orders)  // each item's orders array is flattened
   */
  selectMany<U>(projector: (item: R) => U[]): QueryBuilder<T, U> {
    return new QueryBuilder<T, U>(
      this._source,
      [...this._steps, {
        kind: "selectMany",
        projector: projector as (item: unknown) => unknown[],
      }]
    );
  }

  // ── Sorting ───────────────────────────────────────────────────────────────

  /**
   * Sorts items ascending by the selected key.
   *
   * @example
   * .orderBy(x => x.age)
   */
  orderBy(selector: KeySelector<R, unknown>): QueryBuilder<T, R> {
    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "orderBy", selector: selector as KeySelector<unknown, unknown>, desc: false }]
    );
  }

  /**
   * Sorts items descending by the selected key.
   *
   * @example
   * .orderByDesc(x => x.salary)
   */
  orderByDesc(selector: KeySelector<R, unknown>): QueryBuilder<T, R> {
    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "orderBy", selector: selector as KeySelector<unknown, unknown>, desc: true }]
    );
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  /** Takes the first N items. */
  take(n: number): QueryBuilder<T, R> {
    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "take", n }]
    );
  }

  /** Skips the first N items. */
  skip(n: number): QueryBuilder<T, R> {
    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "skip", n }]
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Filters items to those containing the keyword anywhere in their structure.
   *
   * @example
   * .search("alice")
   * .search(["alice", "bob"])  // OR match
   */
  search(keywords: string | string[], options?: SearchOptions): QueryBuilder<T, R> {
    const kws = Array.isArray(keywords) ? keywords : [keywords];
    const pred: WherePredicate<unknown> = (item) =>
      search(item, kws, { ...options, limit: 1 }).length > 0;

    return new QueryBuilder<T, R>(
      this._source,
      [...this._steps, { kind: "where", predicate: pred }]
    );
  }

  // ── Materialisation (terminal operations) ─────────────────────────────────

  /**
   * Executes the pipeline and returns all results as an array.
   */
  toArray(): R[] {
    return this._execute() as R[];
  }

  /**
   * Returns the first item, or undefined.
   */
  first(): R | undefined {
    const results = this._execute();
    return results[0] as R | undefined;
  }

  /**
   * Returns the last item, or undefined.
   */
  last(): R | undefined {
    const results = this._execute();
    return results[results.length - 1] as R | undefined;
  }

  /**
   * Returns the number of items after all filters.
   */
  count(): number {
    return this._execute().length;
  }

  /**
   * Returns true if any items pass all filters.
   */
  any(): boolean {
    return this._execute().length > 0;
  }

  /**
   * Returns true if all items (after filtering) satisfy the predicate.
   */
  all(predicate: WherePredicate<R>): boolean {
    const results = this._execute() as R[];
    return results.every((item, i) => {
      try { return predicate(item, i); } catch { return false; }
    });
  }

  // ── Aggregations (terminal) ───────────────────────────────────────────────

  /**
   * Groups items and returns group results.
   *
   * @example
   * .groupBy(x => x.country)
   */
  groupBy<K>(selector: KeySelector<R, K>): GroupResult<K, R>[] {
    return aggregateGroupBy(this._execute() as R[], selector);
  }

  /**
   * Sums the numeric result of a selector.
   *
   * @example
   * .sum(x => x.salary)
   */
  sum(selector: KeySelector<R, number>): number {
    return aggregateSum(this._execute() as R[], selector);
  }

  /**
   * Computes the arithmetic mean.
   */
  avg(selector: KeySelector<R, number>): number {
    return aggregateAvg(this._execute() as R[], selector);
  }

  /**
   * Returns the minimum value.
   */
  min(selector: KeySelector<R, number>): number {
    return aggregateMin(this._execute() as R[], selector);
  }

  /**
   * Returns the maximum value.
   */
  max(selector: KeySelector<R, number>): number {
    return aggregateMax(this._execute() as R[], selector);
  }

  /**
   * Returns unique values extracted by the selector.
   *
   * @example
   * .distinct(x => x.country)
   */
  distinct<K>(selector: KeySelector<R, K>): K[] {
    return aggregateDistinct(this._execute() as R[], selector);
  }

  // ── Internal execution ────────────────────────────────────────────────────

  private _execute(): unknown[] {
    let current: unknown[] = Array.from(this._source);

    for (const step of this._steps) {
      if (current.length === 0 && step.kind !== "skip") break;

      switch (step.kind) {
        case "where":
          current = current.filter((item, idx) => {
            try { return step.predicate(item, idx); } catch { return false; }
          });
          break;

        case "select":
          current = current.map((item, idx) => {
            try { return step.projector(item, idx); } catch { return item; }
          });
          break;

        case "selectMany": {
          const flattened: unknown[] = [];
          for (const item of current) {
            let arr: unknown[];
            try { arr = step.projector(item); } catch { arr = []; }
            if (Array.isArray(arr)) flattened.push(...arr);
          }
          current = flattened;
          break;
        }

        case "orderBy": {
          const { selector, desc } = step;
          current = [...current].sort((a, b) => {
            const av = safeCall(selector as (x: unknown) => unknown, a, undefined);
            const bv = safeCall(selector as (x: unknown) => unknown, b, undefined);
            if (av === bv) return 0;
            if (av === undefined || av === null) return 1;
            if (bv === undefined || bv === null) return -1;
            const cmp = av < bv ? -1 : 1;
            return desc ? -cmp : cmp;
          });
          break;
        }

        case "take":
          current = current.slice(0, step.n);
          break;

        case "skip":
          current = current.slice(step.n);
          break;
      }
    }

    return current;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Creates a lazy query builder over an array of items.
 *
 * @example
 * from(users)
 *   .where(x => x.age > 18)
 *   .orderBy(x => x.name)
 *   .select(x => ({ name: x.name, age: x.age }))
 *   .toArray()
 *
 * @example
 * from(orders)
 *   .where("status", "eq", "ACTIVE")
 *   .sum(x => x.total)
 *
 * @example
 * from(data)
 *   .where(x => x.active)
 *   .groupBy(x => x.country)
 */
export function from<T>(data: T[] | readonly T[]): QueryBuilder<T> {
  if (!Array.isArray(data)) {
    throw new TypeError("[json-flux] from() requires an array input.");
  }
  return new QueryBuilder<T>(data);
}
