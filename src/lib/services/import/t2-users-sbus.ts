import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { DB } from "@/lib/db";
import { importBatches, importRows, sbus, users } from "@/lib/db/schema";
import type { ParsedRow } from "./parse";

const ROLES = new Set(["admin", "manager", "member", "center_contributor", "viewer"]);
const SBU_KINDS = new Set(["center", "online_center", "group"]);
const SBU_REGIONS = new Set(["KV1", "KV2", "KV3", "KV2_KV3", "ONLINE", "RND"]);

export interface T2Row {
  rowNumber: number;
  sheet: "USERS" | "SBUS";
  raw: Record<string, string>;
  errors: string[];
  key: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}

function truthy(s: string | undefined): boolean {
  const v = (s ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "x" || v === "yes" || v === "có";
}

export async function validateT2(
  db: DB,
  userRows: ParsedRow[],
  sbuRows: ParsedRow[],
): Promise<T2Row[]> {
  const existingUsers = await db.select({ id: users.id, email: users.email }).from(users);
  const userByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const existingSbus = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  const sbuByCode = new Map(existingSbus.map((s) => [s.code, s.id]));
  const sbuCodesInFile = new Set(sbuRows.map((r) => r.data.code?.trim()).filter(Boolean));

  const out: T2Row[] = [];
  const seenEmails = new Set<string>();
  for (const r of userRows) {
    const errors: string[] = [];
    const email = r.data.email?.trim().toLowerCase();
    const fullName = r.data.full_name?.trim();
    const role = r.data.role?.trim();
    const sbuCode = r.data.sbu_code?.trim();

    if (!email) errors.push("Thiếu email");
    else if (seenEmails.has(email)) errors.push("email trùng trong file");
    else seenEmails.add(email);
    if (!fullName) errors.push("Thiếu full_name");
    if (!role || !ROLES.has(role)) errors.push(`role không hợp lệ: ${role}`);
    if (sbuCode && !sbuByCode.has(sbuCode) && !sbuCodesInFile.has(sbuCode)) errors.push(`sbu_code không tồn tại: ${sbuCode}`);

    const existingId = email ? userByEmail.get(email) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      sheet: "USERS",
      raw: r.data,
      errors,
      key: email ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }

  const seenCodes = new Set<string>();
  for (const r of sbuRows) {
    const errors: string[] = [];
    const code = r.data.code?.trim();
    const name = r.data.name?.trim();
    const kind = r.data.kind?.trim();
    const region = r.data.region?.trim();
    const ownerEmail = r.data.ho_owner_email?.trim().toLowerCase();

    if (!code) errors.push("Thiếu code");
    else if (seenCodes.has(code)) errors.push("code trùng trong file");
    else seenCodes.add(code);
    if (!name) errors.push("Thiếu name");
    if (!kind || !SBU_KINDS.has(kind)) errors.push(`kind không hợp lệ: ${kind}`);
    if (!region || !SBU_REGIONS.has(region)) errors.push(`region không hợp lệ: ${region}`);
    if (ownerEmail && !userByEmail.has(ownerEmail) && !userRows.some((u) => u.data.email?.trim().toLowerCase() === ownerEmail)) {
      errors.push(`ho_owner_email không tồn tại: ${ownerEmail}`);
    }

    const existingId = code ? sbuByCode.get(code) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      sheet: "SBUS",
      raw: r.data,
      errors,
      key: code ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }

  return out;
}

export async function createPendingBatchT2(db: DB, fileName: string, uploadedBy: string, rows: T2Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T2",
      fileName,
      uploadedBy,
      createdCount: rows.filter((r) => r.result === "created").length,
      updatedCount: rows.filter((r) => r.result === "updated").length,
      errorCount: rows.filter((r) => r.result === "error").length,
    })
    .returning();
  await db.insert(importRows).values(
    rows.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: r.sheet,
      rawData: r.raw,
      result: r.result,
      entityType: r.sheet === "USERS" ? "user" : "sbu",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT2Import(db: DB, batchId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  let usersCreated = 0;
  let usersUpdated = 0;
  let sbusCreated = 0;
  let sbusUpdated = 0;

  // SBUS trước (user có thể cần sbu_id; sbu có thể cần ho_owner nhưng user tạo trước đó nếu đã có trong hệ thống).
  for (const row of rows.filter((r) => r.sheet === "SBUS" && r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const [owner] = raw.ho_owner_email
      ? await db.select({ id: users.id }).from(users).where(eq(users.email, raw.ho_owner_email.trim().toLowerCase())).limit(1)
      : [];
    const values = {
      name: raw.name,
      kind: raw.kind as never,
      region: raw.region as never,
      hoOwnerId: owner?.id ?? null,
      active: raw.active === undefined || raw.active === "" ? true : truthy(raw.active),
    };
    if (row.entityId) {
      await db.update(sbus).set(values).where(eq(sbus.id, row.entityId));
      sbusUpdated++;
    } else {
      await db.insert(sbus).values({ code: raw.code.trim(), ...values });
      sbusCreated++;
    }
  }

  for (const row of rows.filter((r) => r.sheet === "USERS" && r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const [sbu] = raw.sbu_code ? await db.select({ id: sbus.id }).from(sbus).where(eq(sbus.code, raw.sbu_code.trim())).limit(1) : [];
    if (row.entityId) {
      await db
        .update(users)
        .set({
          fullName: raw.full_name,
          role: raw.role as never,
          team: (raw.team?.trim() || undefined) as never,
          sbuId: sbu?.id ?? null,
          canAssign: truthy(raw.can_assign),
          active: raw.active === undefined || raw.active === "" ? true : truthy(raw.active),
        })
        .where(eq(users.id, row.entityId));
      usersUpdated++;
    } else {
      const tempPassword = `Vmg@${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(users).values({
        email: raw.email.trim().toLowerCase(),
        fullName: raw.full_name,
        role: raw.role as never,
        team: (raw.team?.trim() || undefined) as never,
        sbuId: sbu?.id ?? null,
        canAssign: truthy(raw.can_assign),
        active: raw.active === undefined || raw.active === "" ? true : truthy(raw.active),
        passwordHash: await bcrypt.hash(tempPassword, 12),
        mustChangePassword: true,
      });
      usersCreated++;
    }
  }

  await db.update(importBatches).set({ summary: { usersCreated, usersUpdated, sbusCreated, sbusUpdated } }).where(eq(importBatches.id, batchId));
  return { usersCreated, usersUpdated, sbusCreated, sbusUpdated };
}
