/**
 * Kiểu dữ liệu cho Data Grid dùng chung — SPEC Mục 16.
 * Cấu trúc `ViewConfig` khớp JSON ở SPEC Mục 16.2 để lưu vào saved_views.config.
 */

export type FieldKind =
  | "text"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "enum"
  | "boolean";

export type Conjunction = "and" | "or";

export type TextOp =
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "empty"
  | "not_empty"
  | "starts_with";

export type NumberOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "empty"
  | "not_empty";

export type DateOp =
  | "on"
  | "before"
  | "after"
  | "between"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "is_overdue"
  | "next_x_days"
  | "empty"
  | "not_empty";

export type EnumOp = "is" | "is_not" | "any_of" | "none_of" | "empty" | "not_empty";
export type BooleanOp = "is_true" | "is_false";

export type FilterOperator = TextOp | NumberOp | DateOp | EnumOp | BooleanOp;

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: unknown;
  /** Đối số phụ cho between / next_x_days. */
  value2?: unknown;
}

export interface FilterGroup {
  conjunction: Conjunction;
  conditions: (FilterCondition | FilterGroup)[];
}

export function isGroup(x: FilterCondition | FilterGroup): x is FilterGroup {
  return (x as FilterGroup).conditions !== undefined;
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

export type AggregateFn = "count" | "sum" | "avg" | "min" | "max";

export interface GroupSpec {
  field: string;
  collapsed?: boolean;
}

export interface ColumnConfig {
  field: string;
  visible?: boolean;
  width?: number;
  pinned?: "left" | null;
  aggregate?: AggregateFn;
}

export interface ViewConfig {
  filters?: FilterGroup;
  sorts?: SortSpec[];
  groupBy?: GroupSpec[];
  columns?: ColumnConfig[];
  rowHeight?: "compact" | "medium" | "tall";
}

/** Bản ghi saved_views rút gọn cho client. */
export interface SavedViewLike {
  id: string;
  entity: string;
  name: string;
  visibility: "PRIVATE" | "SHARED";
  isDefault: boolean;
  config: ViewConfig;
}

/** Mô tả một cột cho grid (kèm cách lấy giá trị, format, kiểu để chọn toán tử). */
export interface GridColumn<Row> {
  field: string;
  header: string;
  kind: FieldKind;
  /** Lấy giá trị thô để lọc/sắp xếp/gom nhóm. */
  accessor: (row: Row) => unknown;
  /** Render ô. Mặc định = String(value). */
  cell?: (row: Row) => React.ReactNode;
  /** Nhãn hiển thị cho giá trị enum. */
  enumLabels?: Record<string, string>;
  enumOptions?: { value: string; label: string }[];
  defaultWidth?: number;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  groupable?: boolean;
  /** Cho phép sửa tại chỗ (nhấp đôi). */
  editable?: boolean;
  /** Kiểu ô sửa: "text" (mặc định, <input>) hoặc "select" (<select>). */
  editKind?: "text" | "select";
  /** Lựa chọn cho editKind="select". `value` là giá trị gửi lên onEditCell. */
  editOptions?: { value: string; label: string }[];
  /** Giá trị khởi tạo ô sửa (mặc định = String(accessor(row))). Dùng khi giá trị
   *  hiển thị khác giá trị lưu (ví dụ tên campaign hiện thị nhưng lưu id). */
  editValue?: (row: Row) => string;
}
