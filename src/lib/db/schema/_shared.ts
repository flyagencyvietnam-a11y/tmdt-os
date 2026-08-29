import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Cột chuẩn cho mọi bảng nghiệp vụ — SPEC Mục 5.2 (5). */
export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};

/** Soft delete — SPEC Mục 5.2 (4). */
export const softDeleteColumn = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const pkUuid = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
