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
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { DateInput, MonthInput } from "@/components/ui/date-input";
import { readSessionNumber, useSessionState, writeSessionNumber } from "@/lib/use-session-state";
import { CustomColumnMenu, AddColumnPopover, useCustomColumns } from "./custom-columns";
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
import { Tag } from "./tag";
import type {
  AggregateFn,
  FieldKind,
  GridColumn,
  SavedViewLike,
  SortSpec,
  ViewConfig,
} from "./types";
import { todayVnDayStr } from "@/lib/time";

/** Một "dòng nhìn thấy" sau khi phẳng hoá cây nhóm — đơn vị để cuộn ảo. */
type VisualRow<Row> =
  | { kind: "group"; node: GroupNode<Row> }
  | { kind: "data"; row: Row; indent: number };

export interface DataGridProps<Row> {
  columns: GridColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  /** Cho saved views + tên file export. */
  entity: string;
  initialView?: ViewConfig;
  savedViews?: SavedViewLike[];
  onSaveView?: (name: string, config: ViewConfig) => Promise<void> | void;
  onDeleteView?: (id: string) => Promise<void> | void;
  onExportAudit?: (rowCount: number) => void;
  bulkActions?: (selected: Row[], clear: () => void) => React.ReactNode;
  onEditCell?: (rowId: string, field: string, value: string) => void | Promise<unknown>;
  emptyText?: string;
  /** Class thêm cho cả dòng (vd. tô đỏ toàn dòng khi trễ hạn, tím khi là việc lặp). */
  rowClassName?: (row: Row) => string | undefined;
  /** Khoá lưu trạng thái (lọc/sắp xếp/nhóm/cuộn) để Back quay về đúng chỗ cũ. Mặc định = entity. */
  persistKey?: string;
  /** Nút "+ Dòng mới" cuối bảng. */
  onAddRow?: () => void;
  addRowLabel?: string;
  /** Cho phép "+ Cột" tự thêm (mặc định bật nếu người dùng có quyền sửa). */
  allowCustomColumns?: boolean;
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
  columns: baseColumns,
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
  rowClassName,
  persistKey,
  onAddRow,
  addRowLabel = "Dòng mới",
  allowCustomColumns = true,
}: DataGridProps<Row>) {
  const storeKey = `grid:${persistKey ?? entity}`;
  const defaultView = React.useMemo<ViewConfig>(() => initialView ?? { rowHeight: "medium" }, [initialView]);
  // Trạng thái bảng (lọc/sắp xếp/nhóm/ẩn cột + ô tìm + nhóm thu gọn) được nhớ theo tab trình duyệt:
  // mở 1 dòng rồi bấm Back sẽ quay về đúng bộ lọc/nhóm đang xem.
  const [ui, setUi, uiRestored] = useSessionState<{ view: ViewConfig; query: string; collapsed: string[] }>(storeKey, {
    view: defaultView,
    query: "",
    collapsed: [],
  });
  const view = ui.view;
  const query = ui.query;
  const collapsedGroups = React.useMemo(() => new Set(ui.collapsed), [ui.collapsed]);
  const setView = React.useCallback(
    (v: ViewConfig | ((p: ViewConfig) => ViewConfig)) => setUi((p) => ({ ...p, view: typeof v === "function" ? v(p.view) : v })),
    [setUi],
  );
  const setQuery = React.useCallback((q: string) => setUi((p) => ({ ...p, query: q })), [setUi]);
  const setCollapsedGroups = React.useCallback((s: Set<string>) => setUi((p) => ({ ...p, collapsed: [...s] })), [setUi]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<{ id: string; field: string; initial?: string } | null>(null);
  const [active, setActive] = React.useState<{ id: string; field: string } | null>(null);

  // --- cột tự thêm (+ Cột) ---
  const custom = useCustomColumns<Row>(entity, allowCustomColumns && !!onEditCell, getRowId);
  const columns = React.useMemo(() => [...baseColumns, ...custom.columns] as GridColumn<Row>[], [baseColumns, custom.columns]);
  const canEdit = !!onEditCell;

  /** Ghi 1 ô: cột tự thêm đi vào bảng grid_custom_*, cột thường đi qua onEditCell của trang. */
  const writeCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      if (custom.isCustom(field)) return custom.setValue(field, rowId, raw);
      return onEditCell?.(rowId, field, raw);
    },
    [custom, onEditCell],
  );

  const accessorOf = React.useCallback(
    (field: string) => {
      const col = columns.find((c) => c.field === field);
      return (r: Row) => (col ? col.accessor(r) : undefined);
    },
    [columns],
  );

  // Giá trị khác nhau của 1 cột (cho bộ lọc dạng danh mục kiểu Airtable). Cache reset khi `rows` đổi.
  const distinctCache = React.useMemo(
    () => new Map<string, string[]>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, custom.columns],
  );
  const distinct = React.useCallback(
    (field: string) => {
      const hit = distinctCache.get(field);
      if (hit) return hit;
      const col = columns.find((c) => c.field === field);
      const set = new Set<string>();
      if (col) {
        for (const r of rows) {
          const v = col.accessor(r);
          if (v == null || v === "") continue;
          if (Array.isArray(v)) v.forEach((x) => set.add(String(x)));
          else set.add(String(v));
          if (set.size > 200) break;
        }
      }
      const arr = [...set].sort((a, b) => a.localeCompare(b, "vi"));
      distinctCache.set(field, arr);
      return arr;
    },
    [rows, columns, distinctCache],
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
    let out = rows;
    if (view.filters && view.filters.conditions.length > 0) {
      out = out.filter((r) => evalGroup(r, view.filters, accessorOf));
    }
    const q = normalizeSearch(query);
    if (q) {
      out = out.filter((r) =>
        visibleColumns.some((c) => normalizeSearch(searchText(c, r)).includes(q)),
      );
    }
    return out;
  }, [rows, view.filters, accessorOf, query, visibleColumns]);

  // --- sắp xếp nhiều cấp ---
  const sorted = React.useMemo(() => {
    const sorts = view.sorts ?? [];
    if (sorts.length === 0) return filtered;
    const copy = filtered.slice();
    copy.sort((a, b) => {
      for (const s of sorts) {
        const av = accessorOf(s.field)(a);
        const bv = accessorOf(s.field)(b);
        // Ô trống luôn xuống CUỐI (cả khi sắp giảm dần) — dòng chưa có ngày không được chiếm đầu danh sách.
        const aNil = av == null || av === "";
        const bNil = bv == null || bv === "";
        if (aNil || bNil) {
          if (aNil && bNil) continue;
          return aNil ? 1 : -1;
        }
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

  const toggleCollapse = React.useCallback(
    (key: string) => {
      const n = new Set(collapsedGroups);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      setCollapsedGroups(n);
    },
    [collapsedGroups, setCollapsedGroups],
  );

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

  // --- nhớ vị trí cuộn trong bảng (Back về đúng dòng đang xem) ---
  const scrollKey = `${storeKey}:scroll`;
  const scrollRestored = React.useRef(false);
  React.useEffect(() => {
    if (scrollRestored.current || !uiRestored || visualRows.length === 0) return;
    scrollRestored.current = true;
    const saved = readSessionNumber(scrollKey);
    if (saved && saved > 0 && scrollRef.current) scrollRef.current.scrollTop = saved;
  }, [uiRestored, visualRows.length, scrollKey, virtualizer]);

  // bề rộng cột cho table-layout: fixed (cuộn ảo cần chiều rộng ổn định)
  const colWidths = React.useMemo(
    () =>
      visibleColumns.map((c) => {
        const cfg = (view.columns ?? []).find((x) => x.field === c.field);
        return cfg?.width ?? c.defaultWidth ?? KIND_W[c.kind] ?? 150;
      }),
    [visibleColumns, view.columns],
  );
  const ADD_COL_W = custom.enabled ? 44 : 0;
  const tableMinWidth =
    SELECT_COL_W + colWidths.reduce((a, b) => a + b, 0) + ADD_COL_W;
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

  // ------------------------------------------------------------------
  //  Điều khiển kiểu Excel: chọn ô, phím mũi tên, gõ để sửa, Enter/Tab, dán nhiều ô
  // ------------------------------------------------------------------
  const dataIndex = React.useMemo(() => {
    const ids: string[] = [];
    const rowsById = new Map<string, Row>();
    const visualIndexById = new Map<string, number>();
    visualRows.forEach((vr, i) => {
      if (vr.kind !== "data") return;
      const id = getRowId(vr.row);
      ids.push(id);
      rowsById.set(id, vr.row);
      visualIndexById.set(id, i);
    });
    return { ids, rowsById, visualIndexById };
  }, [visualRows, getRowId]);

  const focusGrid = React.useCallback(() => {
    // Trả focus cho khung bảng sau khi đóng ô sửa để phím mũi tên tiếp tục hoạt động.
    requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
  }, []);

  const moveActive = React.useCallback(
    (from: { id: string; field: string }, dRow: number, dCol: number) => {
      const fields = visibleColumns.map((c) => c.field);
      let ci = fields.indexOf(from.field);
      let ri = dataIndex.ids.indexOf(from.id);
      if (ci < 0 || ri < 0) return;
      ci += dCol;
      ri += dRow;
      // Tab ở ô cuối hàng → xuống ô đầu hàng kế tiếp (như Excel)
      if (ci >= fields.length) {
        ci = 0;
        ri += 1;
      } else if (ci < 0) {
        ci = fields.length - 1;
        ri -= 1;
      }
      ri = Math.max(0, Math.min(dataIndex.ids.length - 1, ri));
      const id = dataIndex.ids[ri];
      if (id == null) return;
      setActive({ id, field: fields[ci] });
      const vi = dataIndex.visualIndexById.get(id);
      if (vi != null) virtualizer.scrollToIndex(vi, { align: "auto" });
    },
    [visibleColumns, dataIndex, virtualizer],
  );

  const commitEdit = React.useCallback(
    (id: string, field: string, value: string, move: "down" | "right" | "left" | "none") => {
      setEditing(null);
      const col = columns.find((c) => c.field === field);
      const row = dataIndex.rowsById.get(id);
      // Không gọi server nếu giá trị không đổi (tránh refresh thừa khi chỉ nhấn Tab đi qua ô).
      const before = col && row ? (col.editValue ? col.editValue(row) : String(col.accessor(row) ?? "")) : "";
      if (value !== before) void writeCell(id, field, value);
      if (move === "down") moveActive({ id, field }, 1, 0);
      else if (move === "right") moveActive({ id, field }, 0, 1);
      else if (move === "left") moveActive({ id, field }, 0, -1);
      focusGrid();
    },
    [columns, dataIndex, writeCell, moveActive, focusGrid],
  );

  const cancelEdit = React.useCallback(() => {
    setEditing(null);
    focusGrid();
  }, [focusGrid]);

  const startEditing = React.useCallback(
    (id: string, field: string, initial?: string) => {
      const col = columns.find((c) => c.field === field);
      if (!col?.editable || !canEdit) return false;
      setActive({ id, field });
      setEditing({ id, field, initial });
      return true;
    },
    [columns, canEdit],
  );

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Phím gõ trong ô sửa/ô nhập khác do chính ô đó xử lý.
    if (e.target !== e.currentTarget || editing) return;
    if (!active) {
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key) && dataIndex.ids.length && visibleColumns.length) {
        e.preventDefault();
        setActive({ id: dataIndex.ids[0], field: visibleColumns[0].field });
      }
      return;
    }
    const col = columns.find((c) => c.field === active.field);
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return moveActive(active, 1, 0);
      case "ArrowUp":
        e.preventDefault();
        return moveActive(active, -1, 0);
      case "ArrowRight":
        e.preventDefault();
        return moveActive(active, 0, 1);
      case "ArrowLeft":
        e.preventDefault();
        return moveActive(active, 0, -1);
      case "Tab":
        e.preventDefault();
        return moveActive(active, 0, e.shiftKey ? -1 : 1);
      case "Enter":
      case "F2":
        if (startEditing(active.id, active.field)) e.preventDefault();
        else if (e.key === "Enter") moveActive(active, 1, 0);
        return;
      case "Escape":
        setActive(null);
        return;
      case "Delete":
      case "Backspace":
        if (col?.editable && canEdit && col.editKind !== "select") {
          e.preventDefault();
          void writeCell(active.id, active.field, "");
        }
        return;
    }
    if (!mod && !e.altKey && e.key.length === 1 && col?.editable && canEdit) {
      // Gõ ký tự = thay nội dung ô (kiểu Excel). Với ô chọn danh sách: mở danh sách.
      if (startEditing(active.id, active.field, col.editKind === "select" || col.editInputType === "date" ? undefined : e.key)) e.preventDefault();
    }
  }

  function onGridCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !active) return;
    const col = columns.find((c) => c.field === active.field);
    const row = dataIndex.rowsById.get(active.id);
    if (!col || !row) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", searchText(col, row));
  }

  async function onGridPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !active || !canEdit) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const fields = visibleColumns.map((c) => c.field);
    const c0 = fields.indexOf(active.field);
    const r0 = dataIndex.ids.indexOf(active.id);
    if (c0 < 0 || r0 < 0) return;
    let n = 0;
    for (let ri = 0; ri < matrix.length; ri++) {
      const id = dataIndex.ids[r0 + ri];
      if (id == null) break;
      for (let ci = 0; ci < matrix[ri].length; ci++) {
        const col = columns.find((c) => c.field === fields[c0 + ci]);
        if (!col?.editable) continue;
        let v = matrix[ri][ci].trim();
        if (col.editKind === "select") {
          const opt = col.editOptions?.find((o) => o.label.toLowerCase() === v.toLowerCase() || o.value === v);
          if (!opt) continue;
          v = opt.value;
        } else if (col.editInputType === "date") {
          const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
          if (m) v = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        }
        await writeCell(id, col.field, v);
        n++;
      }
    }
    if (n > 0) toast.success(`Đã dán ${n} ô.`);
  }

  const viewChanged = JSON.stringify(view) !== JSON.stringify(defaultView) || query !== "";

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhanh…"
            className="h-8 w-48 bg-background pl-8 pr-7 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Xoá tìm kiếm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
              onClick={() => setQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterButton
          view={view}
          columns={columns}
          distinct={distinct}
          onChange={patchView}
        />
        <SortButton view={view} columns={columns} onChange={patchView} />
        <GroupButton view={view} columns={columns} onChange={patchView} />
        {groups && (
          <div className="flex items-center rounded-md border text-xs">
            <button
              type="button"
              className="px-2 py-1 hover:bg-muted"
              onClick={() =>
                setCollapsedGroups(new Set(allGroupKeys(groups)))
              }
            >
              Thu gọn tất cả
            </button>
            <button
              type="button"
              className="border-l px-2 py-1 hover:bg-muted"
              onClick={() => setCollapsedGroups(new Set())}
            >
              Mở tất cả
            </button>
          </div>
        )}
        <ColumnsButton view={view} columns={columns} onChange={patchView} />
        {viewChanged && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Bỏ mọi bộ lọc/sắp xếp/nhóm đã chọn, về cách xem mặc định"
            onClick={() => {
              setUi({ view: defaultView, query: "", collapsed: [] });
            }}
          >
            <RotateCcw className="h-3 w-3" /> Đặt lại
          </button>
        )}

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
                `${entity.toLowerCase()}-${todayVnDayStr()}`,
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
                `${entity.toLowerCase()}-${todayVnDayStr()}`,
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
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onCopy={onGridCopy}
        onPaste={onGridPaste}
        onScroll={(e) => writeSessionNumber(scrollKey, e.currentTarget.scrollTop)}
        className="overflow-auto rounded-xl border bg-card shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
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
            {custom.enabled && <col style={{ width: ADD_COL_W }} />}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
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
                      {c.customId && custom.defOf(c.field) && (
                        <CustomColumnMenu def={custom.defOf(c.field)!} onRename={custom.rename} onDelete={custom.remove} />
                      )}
                    </span>
                  </th>
                );
              })}
              {custom.enabled && (
                <th className="px-1 text-center">
                  <AddColumnPopover onCreate={custom.create} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visualRows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1 + (custom.enabled ? 1 : 0)}
                  className="px-3 py-14 text-center text-sm text-muted-foreground"
                >
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Search className="h-4 w-4" />
                    </span>
                    <span>{query || rows.length > 0 ? "Không có dòng nào khớp bộ lọc / tìm kiếm." : emptyText}</span>
                  </div>
                </td>
              </tr>
            )}

            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={visibleColumns.length + 2} />
              </tr>
            )}

            {vItems.map((vi) => {
              const vr = visualRows[vi.index];
              if (vr.kind === "group") {
                return (
                  <GroupHeaderRow
                    key={`g:${vr.node.key}`}
                    node={vr.node}
                    column={columns.find((c) => c.field === vr.node.field)}
                    colCount={visibleColumns.length + (custom.enabled ? 1 : 0)}
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
                  rowClass={rowClassName?.(vr.row)}
                  checked={selected.has(id)}
                  onToggle={() => toggleOne(id)}
                  editing={editing}
                  active={active?.id === id ? active.field : null}
                  setActive={(field) => {
                    setActive({ id, field });
                    scrollRef.current?.focus({ preventScroll: true });
                  }}
                  startEditing={startEditing}
                  commitEdit={commitEdit}
                  cancelEdit={cancelEdit}
                  canEdit={canEdit}
                  extraCol={custom.enabled}
                  indent={vr.indent}
                />
              );
            })}

            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={visibleColumns.length + 2} />
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
                {custom.enabled && <td />}
              </tr>
            </tfoot>
          )}
        </table>
        {onAddRow && (
          <button
            type="button"
            onClick={onAddRow}
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> {addRowLabel}
          </button>
        )}
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {sorted.length} / {rows.length} dòng
        {visualRows.length !== sorted.length &&
          ` · ${visualRows.length} dòng hiển thị (đã gom nhóm)`}
        {canEdit && " · Bấm ô để chọn, gõ để sửa, Enter/Tab để sang ô kế, Ctrl+V để dán nhiều ô"}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------

/** Tooltip của ô: hiện đầy đủ chữ bị cắt "…" (+ gợi ý sửa nếu ô sửa được). */
function cellTitle<Row>(c: GridColumn<Row>, row: Row): string | undefined {
  if (c.kind === "boolean") return undefined;
  const text = searchText(c, row);
  return text || undefined;
}

function normalizeSearch(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/** Chuỗi để tìm nhanh của 1 ô: ưu tiên nhãn enum (người dùng gõ nhãn, không gõ id). */
function searchText<Row>(c: GridColumn<Row>, r: Row): string {
  const v = c.accessor(r);
  if (v == null) return "";
  const one = (x: unknown) => {
    const k = String(x);
    return c.enumLabels?.[k] ?? c.enumOptions?.find((o) => o.value === k)?.label ?? c.filterOptions?.find((o) => o.value === k)?.label ?? k;
  };
  return Array.isArray(v) ? v.map(one).join(" ") : one(v);
}

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

type EditMove = "down" | "right" | "left" | "none";

function DataRow<Row>({
  row,
  rowId,
  columns,
  rowHeightClass,
  rowClass,
  checked,
  onToggle,
  editing,
  active,
  setActive,
  startEditing,
  commitEdit,
  cancelEdit,
  canEdit,
  extraCol,
  indent = 0,
}: {
  row: Row;
  rowId: string;
  columns: GridColumn<Row>[];
  rowHeightClass: string;
  rowClass?: string;
  checked: boolean;
  onToggle: () => void;
  editing: { id: string; field: string; initial?: string } | null;
  /** field của ô đang chọn trong dòng này (null nếu ô chọn không thuộc dòng). */
  active: string | null;
  setActive: (field: string) => void;
  startEditing: (id: string, field: string, initial?: string) => boolean;
  commitEdit: (id: string, field: string, value: string, move: EditMove) => void;
  cancelEdit: () => void;
  canEdit: boolean;
  extraCol: boolean;
  indent?: number;
}) {
  return (
    <tr className={cn("border-b hover:bg-muted/30", rowHeightClass, rowClass)}>
      <td className="px-2">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c, ci) => {
        const isEditing = editing?.id === rowId && editing.field === c.field && c.editable && canEdit;
        const isActive = active === c.field;
        return (
          <td
            key={c.field}
            className={cn(
              "overflow-hidden px-3",
              !isEditing && "whitespace-nowrap",
              c.align === "right" && "text-right tabular-nums",
              c.align === "center" && "text-center",
              isActive && "relative bg-brand/[0.06] outline-2 -outline-offset-2 outline-brand/70",
              c.editable && canEdit && "cursor-cell",
            )}
            style={ci === 0 && indent ? { paddingLeft: 12 + indent * 16 } : undefined}
            title={isEditing ? undefined : cellTitle(c, row)}
            onClick={() => {
              if (isEditing) return;
              // Bấm lần 2 vào ô đang chọn (hoặc ô danh sách/ngày) = vào chế độ sửa, như Airtable.
              if (isActive && c.editable && canEdit && !(c.kind === "text" && c.cell)) startEditing(rowId, c.field);
              else setActive(c.field);
            }}
            onDoubleClick={() => c.editable && canEdit && startEditing(rowId, c.field)}
          >
            {isEditing ? (
              <CellEditor
                column={c}
                row={row}
                initial={editing?.initial}
                onCommit={(v, move) => commitEdit(rowId, c.field, v, move)}
                onCancel={cancelEdit}
              />
            ) : c.cell ? (
              <div className="truncate">{c.cell(row)}</div>
            ) : c.kind === "enum" &&
              c.enumColors &&
              c.accessor(row) != null &&
              c.accessor(row) !== "" ? (
              <Tag color={c.enumColors[String(c.accessor(row))]}>
                {c.enumLabels?.[String(c.accessor(row))] ??
                  String(c.accessor(row))}
              </Tag>
            ) : c.kind === "enum" && c.enumLabels ? (
              (c.enumLabels[String(c.accessor(row))] ?? String(c.accessor(row) ?? "–"))
            ) : c.kind === "enum" && c.enumOptions ? (
              (c.enumOptions.find((o) => o.value === String(c.accessor(row)))?.label ?? String(c.accessor(row) ?? "–"))
            ) : c.kind === "date" ? (
              fmtDateCell(c.accessor(row))
            ) : (
              String(c.accessor(row) ?? "–")
            )}
          </td>
        );
      })}
      {extraCol && <td />}
    </tr>
  );
}

/** Ngày luôn dd/mm/yyyy trong ô (kể cả khi cột không khai báo `cell`). */
function fmtDateCell(v: unknown): string {
  if (v == null || v === "") return "–";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Ô sửa tại chỗ: Enter = lưu + xuống dòng, Tab = lưu + sang phải, Esc = huỷ, rời ô = lưu. */
function CellEditor<Row>({
  column: c,
  row,
  initial,
  onCommit,
  onCancel,
}: {
  column: GridColumn<Row>;
  row: Row;
  initial?: string;
  onCommit: (value: string, move: EditMove) => void;
  onCancel: () => void;
}) {
  const current = c.editValue ? c.editValue(row) : String(c.accessor(row) ?? "");
  const done = React.useRef(false);
  const finish = (v: string, move: EditMove) => {
    if (done.current) return;
    done.current = true;
    onCommit(v, move);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  if (c.editKind === "select") {
    return (
      <select
        autoFocus
        ref={(el) => {
          // Mở sẵn danh sách để chọn bằng 1 thao tác.
          if (el) requestAnimationFrame(() => (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.());
        }}
        defaultValue={current}
        className="h-7 w-full rounded border bg-background px-1 text-sm"
        onChange={(e) => finish(e.target.value, "none")}
        onBlur={cancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Tab") {
            e.preventDefault();
            finish((e.target as HTMLSelectElement).value, e.shiftKey ? "left" : "right");
          }
        }}
      >
        {(c.editOptions ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (c.editInputType === "date") {
    return <DateEditor value={current} onCommit={finish} onCancel={cancel} />;
  }
  if (c.editInputType === "month") {
    return <MonthEditor value={current} onCommit={finish} onCancel={cancel} />;
  }

  return (
    <Input
      autoFocus
      type={c.editInputType ?? "text"}
      defaultValue={initial ?? current}
      onFocus={(e) => {
        const el = e.currentTarget;
        // Gõ ký tự để thay → con trỏ cuối; mở bằng Enter/nhấp → chọn hết như Excel.
        if (initial != null) el.setSelectionRange(el.value.length, el.value.length);
        else el.select();
      }}
      className="h-7"
      onBlur={(e) => finish(e.target.value, "none")}
      onKeyDown={(e) => {
        const val = (e.target as HTMLInputElement).value;
        if (e.key === "Enter") {
          e.preventDefault();
          finish(val, e.shiftKey ? "none" : "down");
        } else if (e.key === "Tab") {
          e.preventDefault();
          finish(val, e.shiftKey ? "left" : "right");
        } else if (e.key === "Escape") cancel();
      }}
    />
  );
}

/** Ô sửa tháng (mm/yyyy → "yyyy-mm"). */
function MonthEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string, move: EditMove) => void; onCancel: () => void }) {
  const [v, setV] = React.useState(value);
  const ref = React.useRef(v);
  React.useEffect(() => {
    ref.current = v;
  }, [v]);
  return (
    <div
      onBlur={(e) => {
        // chỉ lưu khi focus rời hẳn khỏi ô (không phải chuyển giữa các phần tử con)
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit(ref.current, "none");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(ref.current, "down");
        else if (e.key === "Tab") {
          e.preventDefault();
          onCommit(ref.current, e.shiftKey ? "left" : "right");
        } else if (e.key === "Escape") onCancel();
      }}
    >
      <MonthInput autoFocus value={v} onChange={setV} className="h-7" />
    </div>
  );
}

function DateEditor({ value, onCommit, onCancel }: { value: string; onCommit: (v: string, move: EditMove) => void; onCancel: () => void }) {
  const [v, setV] = React.useState(value);
  const ref = React.useRef(v);
  React.useEffect(() => {
    ref.current = v;
  }, [v]);
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          onCommit(ref.current, e.shiftKey ? "left" : "right");
        } else if (e.key === "Enter") {
          e.preventDefault();
          onCommit(ref.current, "down");
        }
      }}
    >
      <DateInput autoFocus value={v} onChange={setV} onCommit={(iso) => onCommit(iso, "none")} onCancel={onCancel} className="[&_input]:h-7" />
    </div>
  );
}

/** Mọi khóa nhóm (đệ quy) — cho nút "Thu gọn tất cả". */
function allGroupKeys<Row>(nodes: GroupNode<Row>[]): string[] {
  const out: string[] = [];
  const walk = (ns: GroupNode<Row>[]) => {
    for (const n of ns) {
      out.push(n.key);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Chỉ render dòng tiêu đề nhóm — thân nhóm do vòng cuộn ảo ở DataGrid render. */
function GroupHeaderRow<Row>({
  node,
  column,
  colCount,
  collapsed,
  onToggle,
  rowPx,
}: {
  node: GroupNode<Row>;
  column?: GridColumn<Row>;
  colCount: number;
  collapsed: boolean;
  onToggle: () => void;
  rowPx: number;
}) {
  const raw =
    node.value == null || node.value === "" ? null : String(node.value);
  const label =
    raw == null ? "(trống)" : (column?.enumLabels?.[raw] ?? raw);
  const color = raw != null ? column?.enumColors?.[raw] : undefined;
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
          {color ? <Tag color={color}>{label}</Tag> : label}
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
  distinct,
  onChange,
}: {
  view: ViewConfig;
  columns: GridColumn<Row>[];
  distinct?: (field: string) => string[];
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
          distinct={distinct}
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
