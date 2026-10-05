"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomColumnAction,
  deleteCustomColumnAction,
  loadCustomGridAction,
  renameCustomColumnAction,
  setCustomValuesAction,
  type CustomColumnDef,
  type CustomGridData,
} from "./custom-actions";
import type { GridColumn } from "./types";

const KIND_LABEL: Record<CustomColumnDef["kind"], string> = { text: "Văn bản", number: "Số", date: "Ngày (dd/mm/yyyy)", select: "Danh sách lựa chọn" };

export const CUSTOM_PREFIX = "cf:";

/**
 * Cột tự thêm cho 1 bảng. Giá trị lưu ở grid_custom_values theo (cột, id dòng) — sửa ngay trên bảng
 * như Excel; cập nhật lạc quan (hiện ngay) rồi mới ghi server, lỗi thì hoàn lại.
 */
export function useCustomColumns<Row>(entity: string, canEdit: boolean, getRowId: (r: Row) => string) {
  const [data, setData] = React.useState<CustomGridData>({ columns: [], values: {} });

  const reload = React.useCallback(async () => {
    try {
      setData(await loadCustomGridAction(entity));
    } catch {
      // chưa đăng nhập / DB chưa sẵn — bảng vẫn dùng được không có cột tự thêm
    }
  }, [entity]);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải cột tự thêm từ server sau khi mount
    void reload();
  }, [reload]);

  const columns = React.useMemo<GridColumn<Row>[]>(
    () =>
      data.columns.map((d) => {
        const field = `${CUSTOM_PREFIX}${d.id}`;
        const raw = (r: Row) => data.values[d.id]?.[getRowId(r)] ?? "";
        const base: GridColumn<Row> = {
          field,
          customId: d.id,
          header: d.name,
          kind: d.kind === "select" ? "enum" : d.kind,
          accessor: (r) => {
            const v = raw(r);
            if (v === "") return d.kind === "number" ? null : "";
            return d.kind === "number" ? Number(v) : v;
          },
          editable: canEdit,
          editValue: raw,
          groupable: d.kind === "select" || d.kind === "text",
          defaultWidth: d.kind === "text" ? 180 : 130,
        };
        if (d.kind === "number") return { ...base, editInputType: "number", align: "right" };
        if (d.kind === "date") return { ...base, editInputType: "date" };
        if (d.kind === "select") {
          const opts = d.options.map((o) => ({ value: o, label: o }));
          return { ...base, enumOptions: opts, filterOptions: opts, editKind: "select", editOptions: [{ value: "", label: "— Trống —" }, ...opts] };
        }
        return base;
      }),
    [data, canEdit, getRowId],
  );

  const setValue = React.useCallback(
    async (field: string, rowId: string, raw: string) => {
      const columnId = field.slice(CUSTOM_PREFIX.length);
      const v = raw.trim();
      const prev = data.values[columnId]?.[rowId];
      setData((d) => {
        const col = { ...(d.values[columnId] ?? {}) };
        if (v === "") delete col[rowId];
        else col[rowId] = v;
        return { ...d, values: { ...d.values, [columnId]: col } };
      });
      const res = await setCustomValuesAction(columnId, [{ rowId, value: v }]);
      if (!res.ok) {
        toast.error(res.error);
        setData((d) => {
          const col = { ...(d.values[columnId] ?? {}) };
          if (prev == null) delete col[rowId];
          else col[rowId] = prev;
          return { ...d, values: { ...d.values, [columnId]: col } };
        });
      }
    },
    [data.values],
  );

  const create = React.useCallback(
    async (input: { name: string; kind: CustomColumnDef["kind"]; options: string[] }) => {
      const res = await createCustomColumnAction({ entity, ...input });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(`Đã thêm cột “${input.name}” — bấm vào ô để nhập.`);
      await reload();
      return true;
    },
    [entity, reload],
  );

  const rename = React.useCallback(
    async (id: string, name: string, options?: string[]) => {
      const res = await renameCustomColumnAction(id, name, options);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await reload();
    },
    [reload],
  );

  const remove = React.useCallback(
    async (id: string) => {
      const res = await deleteCustomColumnAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã xoá cột.");
      await reload();
    },
    [reload],
  );

  return {
    enabled: canEdit,
    columns,
    isCustom: (field: string) => field.startsWith(CUSTOM_PREFIX),
    defOf: (field: string) => data.columns.find((c) => `${CUSTOM_PREFIX}${c.id}` === field),
    setValue,
    create,
    rename,
    remove,
  };
}

/** Nút "+" ở cuối hàng tiêu đề: thêm 1 cột mới ngay trên bảng. */
export function AddColumnPopover({ onCreate }: { onCreate: (input: { name: string; kind: CustomColumnDef["kind"]; options: string[] }) => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<CustomColumnDef["kind"]>("text");
  const [opts, setOpts] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const options = opts.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);
    setBusy(true);
    const ok = await onCreate({ name: name.trim(), kind, options });
    setBusy(false);
    if (ok) {
      setOpen(false);
      setName("");
      setOpts("");
      setKind("text");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" title="Thêm cột" aria-label="Thêm cột" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground" />}>
        <Plus className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-2">
          <p className="text-sm font-medium">Thêm cột mới</p>
          <Input autoFocus placeholder="Tên cột (vd. Ghi chú, Link thiết kế…)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && kind !== "select" && name.trim() && submit()} className="h-8" />
          <SimpleSelect
            triggerClassName="h-8 w-full"
            value={kind}
            onValueChange={(v) => v && setKind(v as CustomColumnDef["kind"])}
            options={(Object.keys(KIND_LABEL) as CustomColumnDef["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
          {kind === "select" && <Textarea rows={3} placeholder={"Mỗi lựa chọn 1 dòng (hoặc cách nhau dấu phẩy)\nVD: Đạt, Chưa đạt, Cần sửa"} value={opts} onChange={(e) => setOpts(e.target.value)} />}
          <Button size="sm" className="w-full" disabled={busy || !name.trim()} onClick={submit}>
            Thêm cột
          </Button>
          <p className="text-xs text-muted-foreground">Cột mới hiện cho cả phòng. Sửa/xoá cột bằng nút ⋯ trên tiêu đề cột.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Menu ⋯ trên tiêu đề cột tự thêm: đổi tên / sửa danh sách lựa chọn / xoá. */
export function CustomColumnMenu({ def, onRename, onDelete }: { def: CustomColumnDef; onRename: (id: string, name: string, options?: string[]) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [name, setName] = React.useState(def.name);
  const [opts, setOpts] = React.useState(def.options.join("\n"));
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" aria-label="Tuỳ chọn cột" onClick={(e) => e.stopPropagation()} className="ml-0.5 rounded p-0.5 text-muted-foreground/70 hover:bg-background hover:text-foreground" />}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2 font-normal">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
          {def.kind === "select" && <Textarea rows={4} value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Mỗi lựa chọn 1 dòng" />}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={!name.trim()} onClick={() => onRename(def.id, name, def.kind === "select" ? opts.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean) : undefined)}>
              Lưu
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => {
                if (window.confirm(`Xoá cột “${def.name}” và toàn bộ dữ liệu trong cột?`)) void onDelete(def.id);
              }}
            >
              Xoá cột
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
