"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { gridCustomColumns, gridCustomValues } from "@/lib/db/schema";

/**
 * Cột tự thêm cho DataGrid ("+ Cột" ngay trên bảng). Định nghĩa + giá trị lưu riêng (grid_custom_*),
 * nên mọi bảng nghiệp vụ đều dùng được mà không đổi schema.
 */

export interface CustomColumnDef {
  id: string;
  name: string;
  kind: "text" | "number" | "date" | "select";
  options: string[];
}
export interface CustomGridData {
  columns: CustomColumnDef[];
  /** values[columnId][rowId] = value */
  values: Record<string, Record<string, string>>;
}
type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !["admin", "manager", "member"].includes(user.role)) return null;
  return user;
}

export async function loadCustomGridAction(entity: string): Promise<CustomGridData> {
  const user = await getCurrentUser();
  if (!user) return { columns: [], values: {} };
  const cols = await db.select().from(gridCustomColumns).where(eq(gridCustomColumns.entity, entity)).orderBy(asc(gridCustomColumns.sortOrder), asc(gridCustomColumns.createdAt));
  if (cols.length === 0) return { columns: [], values: {} };
  const vals = await db
    .select({ columnId: gridCustomValues.columnId, rowId: gridCustomValues.rowId, value: gridCustomValues.value })
    .from(gridCustomValues)
    .innerJoin(gridCustomColumns, eq(gridCustomColumns.id, gridCustomValues.columnId))
    .where(eq(gridCustomColumns.entity, entity));
  const values: CustomGridData["values"] = {};
  for (const c of cols) values[c.id] = {};
  for (const v of vals) (values[v.columnId] ??= {})[v.rowId] = v.value;
  return {
    columns: cols.map((c) => ({ id: c.id, name: c.name, kind: c.kind as CustomColumnDef["kind"], options: c.options ?? [] })),
    values,
  };
}

const createSchema = z.object({
  entity: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Nhập tên cột.").max(60),
  kind: z.enum(["text", "number", "date", "select"]),
  options: z.array(z.string().trim().min(1)).max(40).optional(),
});

export async function createCustomColumnAction(input: z.infer<typeof createSchema>): Promise<Result<{ id: string }>> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền thêm cột." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  const d = parsed.data;
  if (d.kind === "select" && (!d.options || d.options.length === 0)) return { ok: false, error: "Cột dạng danh sách cần ít nhất 1 lựa chọn." };
  const [dup] = await db.select({ id: gridCustomColumns.id }).from(gridCustomColumns).where(and(eq(gridCustomColumns.entity, d.entity), eq(gridCustomColumns.name, d.name))).limit(1);
  if (dup) return { ok: false, error: "Đã có cột trùng tên." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(gridCustomColumns).where(eq(gridCustomColumns.entity, d.entity));
  const [row] = await db
    .insert(gridCustomColumns)
    .values({ entity: d.entity, name: d.name, kind: d.kind, options: d.kind === "select" ? (d.options ?? []) : [], sortOrder: Number(n), createdBy: user.id })
    .returning({ id: gridCustomColumns.id });
  return { ok: true, data: { id: row.id } };
}

export async function renameCustomColumnAction(id: string, name: string, options?: string[]): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền." };
  const n = name.trim();
  if (!n) return { ok: false, error: "Nhập tên cột." };
  try {
    await db
      .update(gridCustomColumns)
      .set({ name: n, ...(options ? { options } : {}), updatedBy: user.id })
      .where(eq(gridCustomColumns.id, id));
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Không đổi được tên (có thể trùng tên cột khác)." };
  }
}

export async function deleteCustomColumnAction(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền." };
  await db.delete(gridCustomColumns).where(eq(gridCustomColumns.id, id));
  return { ok: true, data: undefined };
}

/** Ghi 1 ô (value rỗng = xoá giá trị). */
export async function setCustomValuesAction(columnId: string, entries: { rowId: string; value: string }[]): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền sửa." };
  for (const { rowId, value } of entries) {
    const v = value.trim();
    if (v === "") {
      await db.delete(gridCustomValues).where(and(eq(gridCustomValues.columnId, columnId), eq(gridCustomValues.rowId, rowId)));
    } else {
      await db
        .insert(gridCustomValues)
        .values({ columnId, rowId, value: v, updatedBy: user.id })
        .onConflictDoUpdate({ target: [gridCustomValues.columnId, gridCustomValues.rowId], set: { value: v, updatedBy: user.id } });
    }
  }
  return { ok: true, data: undefined };
}
