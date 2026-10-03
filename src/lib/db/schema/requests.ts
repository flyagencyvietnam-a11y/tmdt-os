import { date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
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

/** SPEC Mục 4.2 / 7.4 `requests` — yêu cầu từ phòng ban, trung tâm. */
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
    status: requestStatusEnum("status").notNull().default("new"),
    deliverableUrl: text("deliverable_url"),
    rejectReason: text("reject_reason"),
    taskId: uuid("task_id").references(() => tasks.id),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("requests_status_idx").on(t.status),
    index("requests_sbu_idx").on(t.requesterSbuId),
  ],
);

/** SPEC Mục 7.4 — định tuyến request: (request_type, sbu_id tuỳ chọn) -> assignee. */
export const requestRouting = pgTable(
  "request_routing",
  {
    id: pkUuid(),
    requestType: requestTypeEnum("request_type").notNull(),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    defaultSlaDays: text("default_sla_days"),
    ...auditColumns,
  },
  (t) => [index("request_routing_type_idx").on(t.requestType, t.sbuId)],
);

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
