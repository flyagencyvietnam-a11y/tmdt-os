/**
 * Bộ đánh giá bộ lọc thuần (không phụ thuộc React) — SPEC Mục 16.1.
 * Dùng cho lọc phía client (< 5.000 dòng). Cùng cấu trúc JSON có thể dịch sang
 * WHERE SQL cho lọc phía server về sau.
 */
import {
  addDaysStr,
  monthBounds,
  quarterBounds,
  todayVnDayStr,
  vnDayStr,
} from "@/lib/time";
import type {
  FieldKind,
  FilterCondition,
  FilterGroup,
  FilterOperator,
} from "./types";
import { isGroup } from "./types";

function asDayStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return vnDayStr(v);
  const s = String(v);
  // 'YYYY-MM-DD' hoặc ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : vnDayStr(d);
}

const DIACRITICS = /[̀-ͯ]/g;
function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/đ/g, "d") // đ
    .trim();
}

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Chuẩn hoá giá trị bộ lọc "một trong": mảng, hoặc chuỗi phân tách bằng dấu phẩy. */
function toArr(fv: unknown): unknown[] {
  if (Array.isArray(fv)) return fv;
  if (fv == null || fv === "") return [];
  return String(fv)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** So khớp giá trị enum/picklist: thử bằng tuyệt đối, số, rồi chuỗi bỏ dấu. */
function sameVal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a != null && b != null && Number(a) === Number(b) && String(a).trim() !== "")
    return true;
  return norm(a) === norm(b);
}

export function evalCondition(
  value: unknown,
  operator: FilterOperator,
  cond: FilterCondition,
  now = new Date(),
): boolean {
  const { value: fv, value2: fv2 } = cond;

  switch (operator) {
    // ---- chung ----
    case "empty":
      return isEmpty(value);
    case "not_empty":
      return !isEmpty(value);

    // ---- text ----
    case "contains":
      return norm(value).includes(norm(fv));
    case "not_contains":
      return !norm(value).includes(norm(fv));
    case "starts_with":
      return norm(value).startsWith(norm(fv));
    case "eq":
      return norm(value) === norm(fv) || value === fv || Number(value) === Number(fv);
    case "neq":
      return !(norm(value) === norm(fv) || value === fv);

    // ---- number ----
    case "gt":
      return Number(value) > Number(fv);
    case "gte":
      return Number(value) >= Number(fv);
    case "lt":
      return Number(value) < Number(fv);
    case "lte":
      return Number(value) <= Number(fv);
    case "between": {
      const nv = Number(value);
      return nv >= Number(fv) && nv <= Number(fv2);
    }

    // ---- date ----
    case "on":
      return asDayStr(value) === asDayStr(fv);
    case "before": {
      const a = asDayStr(value);
      const b = asDayStr(fv);
      return !!a && !!b && a < b;
    }
    case "after": {
      const a = asDayStr(value);
      const b = asDayStr(fv);
      return !!a && !!b && a > b;
    }
    case "today":
      return asDayStr(value) === todayVnDayStr(now);
    case "yesterday":
      return asDayStr(value) === addDaysStr(todayVnDayStr(now), -1);
    case "last_7_days": {
      const a = asDayStr(value);
      const today = todayVnDayStr(now);
      return !!a && a <= today && a >= addDaysStr(today, -6);
    }
    case "last_30_days": {
      const a = asDayStr(value);
      const today = todayVnDayStr(now);
      return !!a && a <= today && a >= addDaysStr(today, -29);
    }
    case "this_month": {
      const a = asDayStr(value);
      const [s, e] = monthBounds(todayVnDayStr(now));
      return !!a && a >= s && a <= e;
    }
    case "last_month": {
      const a = asDayStr(value);
      const [s0] = monthBounds(todayVnDayStr(now));
      const prev = addDaysStr(s0, -1);
      const [s, e] = monthBounds(prev);
      return !!a && a >= s && a <= e;
    }
    case "this_quarter": {
      const a = asDayStr(value);
      const [s, e] = quarterBounds(todayVnDayStr(now));
      return !!a && a >= s && a <= e;
    }
    case "is_overdue": {
      const a = asDayStr(value);
      return !!a && a < todayVnDayStr(now);
    }
    case "next_x_days": {
      const a = asDayStr(value);
      const today = todayVnDayStr(now);
      const x = Number(fv ?? fv2 ?? 0);
      return !!a && a >= today && a <= addDaysStr(today, x);
    }

    // ---- enum ----
    case "is":
      return sameVal(value, fv);
    case "is_not":
      return !sameVal(value, fv);
    case "any_of": {
      const arr = toArr(fv);
      return arr.some((x) => sameVal(x, value));
    }
    case "none_of": {
      const arr = toArr(fv);
      return arr.length > 0 && !arr.some((x) => sameVal(x, value));
    }

    // ---- boolean ----
    case "is_true":
      return value === true;
    case "is_false":
      return value === false || value == null;

    default:
      return true;
  }
}

/** Áp một nhóm điều kiện (đệ quy) lên một hàng, dùng accessor để lấy giá trị field. */
export function evalGroup<Row>(
  row: Row,
  group: FilterGroup | undefined,
  accessorOf: (field: string) => (r: Row) => unknown,
  now = new Date(),
): boolean {
  if (!group || group.conditions.length === 0) return true;
  const results = group.conditions.map((c) => {
    if (isGroup(c)) return evalGroup(row, c, accessorOf, now);
    const value = accessorOf(c.field)(row);
    return evalCondition(value, c.operator, c, now);
  });
  return group.conjunction === "and"
    ? results.every(Boolean)
    : results.some(Boolean);
}

/** Danh sách toán tử hợp lệ theo kiểu field — dùng dựng UI filter builder (SPEC 16.1). */
export const OPERATORS_BY_KIND: Record<
  FieldKind,
  { value: FilterOperator; label: string; args: 0 | 1 | 2 }[]
> = {
  text: [
    { value: "contains", label: "chứa", args: 1 },
    { value: "not_contains", label: "không chứa", args: 1 },
    { value: "eq", label: "bằng", args: 1 },
    { value: "neq", label: "khác", args: 1 },
    { value: "starts_with", label: "bắt đầu bằng", args: 1 },
    { value: "empty", label: "rỗng", args: 0 },
    { value: "not_empty", label: "không rỗng", args: 0 },
  ],
  number: numberOps(),
  money: numberOps(),
  date: dateOps(),
  datetime: dateOps(),
  enum: [
    { value: "is", label: "là", args: 1 },
    { value: "is_not", label: "không là", args: 1 },
    { value: "any_of", label: "là một trong", args: 1 },
    { value: "none_of", label: "không là một trong", args: 1 },
    { value: "empty", label: "rỗng", args: 0 },
    { value: "not_empty", label: "không rỗng", args: 0 },
  ],
  boolean: [
    { value: "is_true", label: "đúng", args: 0 },
    { value: "is_false", label: "sai", args: 0 },
  ],
};

function numberOps(): { value: FilterOperator; label: string; args: 0 | 1 | 2 }[] {
  return [
    { value: "eq", label: "=", args: 1 },
    { value: "neq", label: "≠", args: 1 },
    { value: "gt", label: ">", args: 1 },
    { value: "gte", label: "≥", args: 1 },
    { value: "lt", label: "<", args: 1 },
    { value: "lte", label: "≤", args: 1 },
    { value: "between", label: "trong khoảng", args: 2 },
    { value: "empty", label: "rỗng", args: 0 },
    { value: "not_empty", label: "không rỗng", args: 0 },
  ];
}

function dateOps(): { value: FilterOperator; label: string; args: 0 | 1 | 2 }[] {
  return [
    { value: "on", label: "đúng ngày", args: 1 },
    { value: "before", label: "trước", args: 1 },
    { value: "after", label: "sau", args: 1 },
    { value: "between", label: "trong khoảng", args: 2 },
    { value: "today", label: "hôm nay", args: 0 },
    { value: "yesterday", label: "hôm qua", args: 0 },
    { value: "last_7_days", label: "7 ngày qua", args: 0 },
    { value: "last_30_days", label: "30 ngày qua", args: 0 },
    { value: "this_month", label: "tháng này", args: 0 },
    { value: "last_month", label: "tháng trước", args: 0 },
    { value: "this_quarter", label: "quý này", args: 0 },
    { value: "is_overdue", label: "quá hạn", args: 0 },
    { value: "next_x_days", label: "trong X ngày tới", args: 1 },
    { value: "empty", label: "rỗng", args: 0 },
    { value: "not_empty", label: "không rỗng", args: 0 },
  ];
}
