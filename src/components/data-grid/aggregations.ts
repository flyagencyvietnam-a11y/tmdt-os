import type { AggregateFn } from "./types";

/** Dòng tổng hợp cho một nhóm — SPEC Mục 16.1 (Gom nhóm). */
export function aggregate(values: unknown[], fn: AggregateFn): number | null {
  const nums = values
    .map((v) => (typeof v === "string" ? Number(v) : (v as number)))
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  switch (fn) {
    case "count":
      return values.length;
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case "min":
      return nums.length ? Math.min(...nums) : null;
    case "max":
      return nums.length ? Math.max(...nums) : null;
    default:
      return null;
  }
}

export interface GroupNode<Row> {
  key: string;
  field: string;
  value: unknown;
  rows: Row[];
  children?: GroupNode<Row>[];
  depth: number;
}

/** Gom nhóm nhiều cấp (tối đa 3 — SPEC Mục 16.1). */
export function buildGroups<Row>(
  rows: Row[],
  fields: string[],
  accessorOf: (field: string) => (r: Row) => unknown,
  depth = 0,
): GroupNode<Row>[] {
  if (fields.length === 0 || depth >= 3) return [];
  const [field, ...rest] = fields;
  const acc = accessorOf(field);
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const raw = acc(row);
    const key = raw == null || raw === "" ? "∅" : String(raw);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  return [...buckets.entries()].map(([key, groupRows]) => ({
    key: `${depth}:${field}:${key}`,
    field,
    value: key === "∅" ? null : acc(groupRows[0]),
    rows: groupRows,
    depth,
    children: rest.length
      ? buildGroups(groupRows, rest, accessorOf, depth + 1)
      : undefined,
  }));
}
