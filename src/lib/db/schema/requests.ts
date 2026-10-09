import { sql } from "drizzle-orm";
import { date, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import {
  requestInScopeEnum,
  requestSourceChannelEnum,
  requestStatusEnum,
  requestTypeEnum,
} from "./enums";
import { sbus } from "./sbus";
import { tasks } from "./tasks";
import { users } from "./users";

/** SPEC Mục 4.2 / 7.4 `requests` — sổ ghi nhận task được order (không có bước duyệt, Phụ lục D mục 25). */
export const requests = pgTable(
  "requests",
  {
    id: pkUuid(),
    code: text("code").notNull().unique(),
    receivedDate: date("received_date").notNull(),
    sourceChannel: requestSourceChannelEnum("source_channel").notNull().default("other"),
    requesterName: text("requester_name").notNull(),
    requesterSbuId: uuid("requester_sbu_id").references(() => sbus.id),
    requestType: requestTypeEnum("request_type").notNull().default("other"),
    /** Online/Offline x Inbound/Outbound — chữ tự do (Mục 4.2). */
    sbuGroup: text("sbu_group"),
    description: text("description").notNull(),
    referenceUrl: text("reference_url"),
    priority: text("priority"),
    desiredDate: date("desired_date"),
    inScope: requestInScopeEnum("in_scope").notNull().default("needs_review"),
    acceptedById: uuid("accepted_by_id").references(() => users.id),
    committedDate: date("committed_date"),
    completedDate: date("completed_date"),
    status: requestStatusEnum("status").notNull().default("in_progress"),
    deliverableUrl: text("deliverable_url"),
    rejectReason: text("reject_reason"),
    taskId: uuid("task_id").references(() => tasks.id),
    /** Khoá upsert khi import T5 (Mục 10.2) — giống cơ chế `tasks.external_key`. */
    externalKey: text("external_key"),
    importScope: text("import_scope"),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("requests_status_idx").on(t.status),
    index("requests_sbu_idx").on(t.requesterSbuId),
    uniqueIndex("requests_import_uniq")
      .on(t.importScope, t.externalKey)
      .where(sql`${t.externalKey} is not null and ${t.deletedAt} is null`),
  ],
);

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
