"use client";

/**
 * Data Grid dùng chung — SPEC Mục 16. Hand-rolled trên filter-engine/aggregations
 * thuần (có thể thay nền bằng TanStack Table sau mà không đổi API này).
 *
 * Đã có: lọc lồng AND/OR, sắp xếp nhiều cấp, gom nhóm tới 3 cấp + dòng tổng hợp,
 * ẩn/hiện cột, chọn nhiều dòng + thao tác hàng loạt, xuất CSV/XLSX, view lưu được,
 * **cuộn ảo** (chỉ render các dòng đang thấy — phẳng hoá cả cây nhóm).
 * TODO (Phase sau): kéo-đổi thứ tự cột, sửa tại chỗ đa kiểu, ghim cột,
 * chia sẻ view bằng link.
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  Filter as FilterIcon,
  Group,
  ArrowUpDown,
  Save,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { aggregate, buildGroups, type GroupNode } from "./aggregations";
import { downloadCsv, downloadXlsx, rowsToCsv } from "./export-csv";
import { evalGroup } from "./filter-engine";
import { emptyFilterGroup, FilterBuilder } from "./filter-builder";
import type {
  AggregateFn,
  FieldKind,
  GridColumn,
  SavedViewLike,
  SortSpec,
  ViewConfig,
} from "./types";

/** Một "dòng nhìn thấy" sau khi phẳng hoá cây nhóm — đơn vị để cuộn ảo. */
type VisualRow<Row> =
  | { kind: "group"; node: GroupNode<Row> }
  | { kind: "data"; row: Row; indent: number };

export interface DataGridProps<Row> {
  columns: GridColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  /** Cho saved views + tên file export. */
  entity: "LEADS" | "CAMPAIGNS" | "TASKS" | "DAILY_METRICS" | "ENROLLMENTS";
  initialView?: ViewConfig;
  savedViews?: SavedViewLike[];
  onSaveView?: (name: string, config: ViewConfig) => Promise<void> | void;
  onDeleteView?: (id: string) => Promise<void> | void;
  onExportAudit?: (rowCount: number) => void;
  bulkActions?: (selected: Row[], clear: () => void) => React.ReactNode;
  onEditCell?: (rowId: string, field: string, value: string) => void;
  emptyText?: string;
}

const triggerBtn = cn(buttonVariants({ variant: "outline", size: "sm" }));

const ROW_H: Record<NonNullable<ViewConfig["rowHeight"]>, string> = {
  compact: "h-8 text-xs",
  medium: "h-10 text-sm",
  tall: "h-14 text-sm",
};

/** Chiều cao dòng tính bằng px — cho ước lượng cuộn ảo (khớp ROW_H). */
const ROW_PX: Record<NonNullable<ViewConfig["rowHeight"]>, number> = {
  compact: 32,
  medium: 40,
  tall: 56,
};

/** Bề rộng cột mặc định theo kiểu dữ liệu (khi view/column chưa đặt width). */
const KIND_W: Record<FieldKind, number> = {
  text: 180,
  number: 120,
  money: 130,
  date: 120,
  datetime: 150,
  enum: 140,
  boolean: 90,
};

/** Bề rộng cột ô chọn (checkbox) — cố định. */
const SELECT_COL_W = 40;

/** Chiều cao tối đa vùng cuộn của grid. */
const GRID_MAX_H = "70vh";

export function DataGrid<Row>({
  columns,
  rows,
  getRowId,
  entity,
  initialView,
  savedViews = [],
  onSaveView,
  onDeleteView,
  onExportAudit,
  bulkActions,
  onEditCell,
  emptyText = "Không có dòng nào khớp bộ lọc.",
}: DataGridProps<Row>) {
  const [view, setView] = React.useState<ViewConfig>(
    () => initialView ?? { rowHeight: "medium" },
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    new Set(),
  );
  const [editing, setEditing] = React.useState<{ id: string; field: string } | null>(
    null,
  );

  const accessorOf = React.useCallback(
    (field: string) => {
      const col = columns.find((c) => c.field === field);
      return (r: Row) => (col ? col.accessor(r) : undefined);
    },
    [columns],
  );

  const visibleColumns = React.useMemo(() => {
    const cfg = view.columns ?? [];
    const hidden = new Set(
      cfg.filter((c) => c.visible === false).map((c) => c.field),
    );
    return columns.filter((c) => !hidden.has(c.field));
  }, [columns, view.columns]);

  // --- lọc ---
  const filtered = React.useMemo(() => {
    if (!view.filters || view.filters.conditions.length === 0) return rows;
    return rows.filter((r) => evalGroup(r, view.filters, accessorOf));
  }, [rows, view.filters, accessorOf]);

  // --- sắp xếp nhiều cấp ---
  const sorted = React.useMemo(() => {
    const sorts = view.sorts ?? [];
    if (sorts.length === 0) return filtered;
    const copy = filtered.slice();
    copy.sort((a, b) => {
      for (const s of sorts) {
        const av = accessorOf(s.field)(a);
        const bv = accessorOf(s.field)(b);
        const cmp = compare(av, bv);
        if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return copy;
  }, [filtered, view.sorts, accessorOf]);

  // --- gom nhóm ---
  const groups = React.useMemo(() => {
    const g = (view.groupBy ?? []).map((x) => x.field).slice(0, 3);
    if (g.length === 0) return null;
    return buildGroups(sorted, g, accessorOf);
  }, [sorted, view.groupBy, accessorOf]);

  const toggleCollapse = React.useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  // --- phẳng hoá (group header + data row) để cuộn ảo, bỏ qua con của nhóm đã thu ---
  const visualRows = React.useMemo<VisualRow<Row>[]>(() => {
    const out: VisualRow<Row>[] = [];
    if (groups) {
      const walk = (nodes: GroupNode<Row>[]) => {
        for (const n of nodes) {
          out.push({ kind: "group", node: n });
          if (collapsedGroups.has(n.key)) continue;
          if (n.children) walk(n.children);
          else
            for (const r of n.rows)
              out.push({ kind: "data", row: r, indent: n.depth + 1 });
        }
      };
      walk(groups);
    } else {
      for (const r of sorted) out.push({ kind: "data", row: r, indent: 0 });
    }
    return out;
  }, [groups, sorted, collapsedGroups]);

  const rowHeightClass = ROW_H[view.rowHeight ?? "medium"];
  const rowPx = ROW_PX[view.rowHeight ?? "medium"];

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPx,
    overscan: 12,
  });
  const vItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const padTop = vItems.length ? vItems[0].start : 0;
  const padBottom = vItems.length
    ? totalSize - vItems[vItems.length - 1].end
    : 0;

  // bề rộng cột cho table-layout: fixed (cuộn ảo cần chiều rộng ổn định)
  const colWidths = React.useMemo(
    () =>
      visibleColumns.map((c) => {
        const cfg = (view.columns ?? []).find((x) => x.field === c.field);
        return cfg?.width ?? c.defaultWidth ?? KIND_W[c.kind] ?? 150;
      }),
    [visibleColumns, view.columns],
  );
  const tableMinWidth =
    SELECT_COL_W + colWidths.reduce((a, b) => a + b, 0);
  const allChecked = sorted.length > 0 && selected.size === sorted.length;

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(sorted.map(getRowId)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function patchView(p: Partial<ViewConfig>) {
    setView((v) => ({ ...v, ...p }));
  }

  const selectedRows = sorted.filter((r) => selected.has(getRowId(r)));

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton view={view} columns={columns} onChange={patchView} />
        <SortButton view={view} columns={columns} onChange={patchView} />
        <GroupButton view={view} columns={columns} onChange={patchView} />
        <ColumnsButton view={view} columns={columns} onChange={patchView} />

        <div className="ml-auto flex items-center gap-2">
          {onSaveView && (
            <SavedViewControls
              entity={entity}
              savedViews={savedViews}
              currentConfig={view}
              onApply={(cfg) => setView(cfg)}
              onSaveView={onSaveView}
              onDeleteView={onDeleteView}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadCsv(
                `${entity.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
                rowsToCsv(sorted, visibleColumns),
              );
              onExportAudit?.(sorted.length);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadXlsx(
                `${entity.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
                entity,
                sorted,
                visibleColumns,
              ).catch(() => {})
            }
          >
            <Download className="mr-1 h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>

      {/* Thanh chọn nhiều dòng */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">Đã chọn {selected.size}</span>
          {bulkActions?.(selectedRows, () => setSelected(new Set()))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Bỏ chọn
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="overflow-auto rounded-md border"
        style={{ maxHeight: GRID_MAX_H }}
      >
        <table
          className="border-collapse text-left"
          style={{ tableLayout: "fixed", width: "100%", minWidth: tableMinWidth }}
        >
          <colgroup>
            <col style={{ width: SELECT_COL_W }} />
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b">
              <th className="px-2">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
              </th>
              {visibleColumns.map((c) => {
                const sort = (view.sorts ?? []).find((s) => s.field === c.field);
                return (
                  <th
                    key={c.field}
                    className={cn(
                      "truncate px-3 py-2 text-xs font-semibold text-muted-foreground",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.sortable !== false && "cursor-pointer select-none",
                    )}
                    onClick={() =>
                      c.sortable !== false &&
                      patchView({ sorts: cycleSort(view.sorts, c.field) })
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {sort?.direction === "asc" && <ArrowUp className="h-3 w-3" />}
                      {sort?.direction === "desc" && (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visualRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            )}

            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={visibleColumns.length + 1} />
              </tr>
            )}

            {vItems.map((vi) => {
              const vr = visualRows[vi.index];
              if (vr.kind === "group") {
                return (
                  <GroupHeaderRow
                    key={`g:${vr.node.key}`}
                    node={vr.node}
                    colCount={visibleColumns.length}
                    collapsed={collapsedGroups.has(vr.node.key)}
                    onToggle={() => toggleCollapse(vr.node.key)}
                    rowPx={rowPx}
                  />
                );
              }
              const id = getRowId(vr.row);
              return (
                <DataRow
                  key={id}
                  row={vr.row}
                  rowId={id}
                  columns={visibleColumns}
                  rowHeightClass={rowHeightClass}
                  checked={selected.has(id)}
                  onToggle={() => toggleOne(id)}
                  editing={editing}
                  setEditing={setEditing}
                  onEditCell={onEditCell}
                  indent={vr.indent}
                />
              );
            })}

            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={visibleColumns.length + 1} />
              </tr>
            )}
          </tbody>
          {!groups && sorted.length > 0 && hasAggregates(view) && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-medium">
                <td />
                {visibleColumns.map((c) => (
                  <td
                    key={c.field}
                    className={cn(
                      "px-3 py-2 text-sm",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {aggFor(view, c.field)
                      ? formatAgg(
                          aggregate(
                            sorted.map((r) => c.accessor(r)),
                            aggFor(view, c.field)!,
                          ),
                          aggFor(view, c.field)!,
                        )
                      : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {sorted.length} / {rows.length} dòng
        {visualRows.length !== sorted.length &&
          ` · ${visualRows.length} dòng hiển thị (đã gom nhóm)`}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "vi");
}

function cycleSort(
  sorts: SortSpec[] | undefined,
  field: string,
): SortSpec[] {
  const list = sorts ? sorts.slice() : [];
  const i = list.findIndex((s) => s.field === field);
  if (i === -1) return [...list, { field, direction: "asc" }];
  if (list[i].direction === "asc") {
    list[i] = { field, direction: "desc" };
    return list;
  }
  return list.filter((s) => s.field !== field);
}

function hasAggregates(view: ViewConfig): boolean {
  return (view.columns ?? []).some((c) => c.aggregate);
}
function aggFor(view: ViewConfig, field: string): AggregateFn | undefined {
  return (view.columns ?? []).find((c) => c.field === field)?.aggregate;
}
function formatAgg(v: number | null, fn: AggregateFn): string {
  if (v == null) return "–";
  if (fn === "count") return String(v);
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function DataRow<Row>({
  row,
  rowId,
  columns,
  rowHeightClass,
  checked,
  onToggle,
  editing,
  setEditing,
  onEditCell,
  indent = 0,
}: {
  row: Row;
  rowId: string;
  columns: GridColumn<Row>[];
  rowHeightClass: string;
  checked: boolean;
  onToggle: () => void;
  editing: { id: string; field: string } | null;
  setEditing: (e: { id: string; field: string } | null) => void;
  onEditCell?: (rowId: string, field: string, value: string) => void;
  indent?: number;
}) {
  return (
    <tr className={cn("border-b hover:bg-muted/30", rowHeightClass)}>
      <td className="px-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c, ci) => {
        const isEditing =
          editing?.id === rowId && editing.field === c.field && c.editable;
        return (
          <td
            key={c.field}
            className={cn(
              "px-3",
              c.align === "right" && "text-right tabular-nums",
              c.align === "center" && "text-center",
            )}
            style={ci === 0 && indent ? { paddingLeft: 12 + indent * 16 } : undefined}
            onDoubleClick={() =>
              c.editable && setEditing({ id: rowId, field: c.field })
            }
          >
            {isEditing ? (
              <Input
                autoFocus
                defaultValue={String(c.accessor(row) ?? "")}
                className="h-7"
                onBlur={(e) => {
                  onEditCell?.(rowId, c.field, e.target.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onEditCell?.(rowId, c.field, (e.target as HTMLInputElement).value);
                    setEditing(null);
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : c.cell ? (
              c.cell(row)
            ) : c.kind === "enum" && c.enumLabels ? (
              (c.enumLabels[String(c.accessor(row))] ?? String(c.accessor(row) ?? "–"))
            ) : (
              String(c.accessor(row) ?? "–")
            )}
          </td>
        );
      })}
    </tr>
  );
}

/** Chỉ render dòng tiêu đề nhóm — thân nhóm do vòng cuộn ảo ở DataGrid render. */
function GroupHeaderRow<Row>({
  node,
  colCount,
  collapsed,
  onToggle,
  rowPx,
}: {
  node: GroupNode<Row>;
  colCount: number;
  collapsed: boolean;
  onToggle: () => void;
  rowPx: number;
}) {
  const label =
    node.value == null || node.value === "" ? "(trống)" : String(node.value);
  return (
    <tr className="border-b bg-muted/50" style={{ height: rowPx }}>
      <td />
      <td
        colSpan={colCount}
        className="truncate px-3 text-sm font-medium"
        style={{ paddingLeft: 12 + node.depth * 16 }}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {label}
          <Badge variant="secondary" className="ml-2">
            {node.rows.length}
          </Badge>
        </button>
      </td>
    </tr>
  );
}

// --------------------------------------------------------------------------
//  Toolbar buttons
// --------------------------------------------------------------------------

function FilterButton<Row>({
  view,
  columns,
  onChange,
}: {
  view: ViewConfig;
  columns: GridColumn<Row>[];
  onChange: (p: Partial<ViewConfig>) => void;
}) {
  const count = countConditions(view.filters);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={triggerBtn} />}>
        <>
          <FilterIcon className="mr-1 h-4 w-4" /> Lọc
          {count > 0 && (
            <Badge variant="secondary" className="ml-1">
              {count}
            </Badge>
          )}
        </>
      </PopoverTrigger>
      <PopoverContent className="w-[560px]" align="start">
        <FilterBuilder
          columns={columns}
          value={view.filters ?? emptyFilterGroup()}
          onChange={(g) => onChange({ filters: g })}
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ filters: emptyFilterGroup() })}
          >
            Xóa hết
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortButton<Row>({
  view,
  columns,
  onChange,
}: {
  view: ViewConfig;
  columns: GridColumn<Row>[];
  onChange: (p: Partial<ViewConfig>) => void;
}) {
  const sorts = view.sorts ?? [];
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={triggerBtn} />}>
        <>
          <ArrowUpDown className="mr-1 h-4 w-4" /> Sắp xếp
          {sorts.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {sorts.length}
            </Badge>
          )}
        </>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          {sorts.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <SimpleSelect
                triggerClassName="h-7 flex-1"
                value={s.field}
                onValueChange={(field) => {
                  const next = sorts.slice();
                  next[i] = { ...s, field };
                  onChange({ sorts: next });
                }}
                options={columns.map((c) => ({ value: c.field, label: c.header }))}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-16"
                onClick={() => {
                  const next = sorts.slice();
                  next[i] = {
                    ...s,
                    direction: s.direction === "asc" ? "desc" : "asc",
                  };
                  onChange({ sorts: next });
                }}
              >
                {s.direction === "asc" ? "A→Z" : "Z→A"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  onChange({ sorts: sorts.filter((_, j) => j !== i) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() =>
              onChange({
                sorts: [...sorts, { field: columns[0].field, direction: "asc" }],
              })
            }
          >
            Thêm cấp sắp xếp
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupButton<Row>({
  view,
  columns,
  onChange,
}: {
  view: ViewConfig;
  columns: GridColumn<Row>[];
  onChange: (p: Partial<ViewConfig>) => void;
}) {
  const groupBy = view.groupBy ?? [];
  const groupable = columns.filter((c) => c.groupable !== false);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={triggerBtn} />}>
        <>
          <Group className="mr-1 h-4 w-4" /> Nhóm
          {groupBy.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {groupBy.length}
            </Badge>
          )}
        </>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          {[0, 1, 2].map((level) => (
            <SimpleSelect
              key={level}
              triggerClassName="h-8 w-full"
              placeholder={`Cấp ${level + 1}`}
              value={groupBy[level]?.field ?? "__none"}
              onValueChange={(field) => {
                const next = groupBy.slice(0, level);
                if (field && field !== "__none") next.push({ field });
                onChange({ groupBy: next });
              }}
              options={[
                { value: "__none", label: "— không —" },
                ...groupable.map((c) => ({ value: c.field, label: c.header })),
              ]}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            Đặt cột tổng hợp ở nút “Cột”.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnsButton<Row>({
  view,
  columns,
  onChange,
}: {
  view: ViewConfig;
  columns: GridColumn<Row>[];
  onChange: (p: Partial<ViewConfig>) => void;
}) {
  const cfg = view.columns ?? [];
  const get = (f: string) => cfg.find((c) => c.field === f);
  function setCol(field: string, patch: Partial<(typeof cfg)[number]>) {
    const next = cfg.filter((c) => c.field !== field);
    next.push({ field, ...get(field), ...patch });
    onChange({ columns: next });
  }
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={triggerBtn} />}>
        <>
          <Columns3 className="mr-1 h-4 w-4" /> Cột
        </>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {columns.map((c) => {
            const conf = get(c.field);
            const visible = conf?.visible !== false;
            return (
              <div key={c.field} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={visible}
                  onCheckedChange={(v) => setCol(c.field, { visible: !!v })}
                />
                <span className="flex-1 truncate">{c.header}</span>
                {(c.kind === "number" || c.kind === "money") && (
                  <SimpleSelect
                    triggerClassName="h-7 w-24"
                    value={conf?.aggregate ?? "__none"}
                    onValueChange={(v) =>
                      setCol(c.field, {
                        aggregate:
                          v === "__none" ? undefined : (v as AggregateFn),
                      })
                    }
                    options={[
                      { value: "__none", label: "—" },
                      { value: "sum", label: "tổng" },
                      { value: "avg", label: "TB" },
                      { value: "min", label: "nhỏ nhất" },
                      { value: "max", label: "lớn nhất" },
                      { value: "count", label: "đếm" },
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedViewControls({
  entity,
  savedViews,
  currentConfig,
  onApply,
  onSaveView,
  onDeleteView,
}: {
  entity: string;
  savedViews: SavedViewLike[];
  currentConfig: ViewConfig;
  onApply: (cfg: ViewConfig) => void;
  onSaveView: (name: string, config: ViewConfig) => Promise<void> | void;
  onDeleteView?: (id: string) => Promise<void> | void;
}) {
  const [name, setName] = React.useState("");
  const mine = savedViews.filter((v) => v.entity === entity);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={triggerBtn} />}>
        <>
          <Save className="mr-1 h-4 w-4" /> View
          {mine.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {mine.length}
            </Badge>
          )}
        </>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <div className="space-y-1">
            {mine.length === 0 && (
              <p className="text-xs text-muted-foreground">Chưa có view nào.</p>
            )}
            {mine.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-sm">
                <button
                  className="flex-1 truncate text-left hover:underline"
                  onClick={() => onApply(v.config as ViewConfig)}
                >
                  {v.name}
                  {v.visibility === "SHARED" && (
                    <Badge variant="outline" className="ml-1">
                      chung
                    </Badge>
                  )}
                </button>
                {onDeleteView && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDeleteView(v.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t pt-2">
            <Input
              className="h-7"
              placeholder="Tên view mới"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              size="sm"
              className="h-7"
              disabled={!name.trim()}
              onClick={async () => {
                await onSaveView(name.trim(), currentConfig);
                setName("");
              }}
            >
              Lưu
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function countConditions(g?: {
  conditions: unknown[];
}): number {
  if (!g) return 0;
  return g.conditions.length;
}
