import { date, index, integer, pgTable, text, time, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import { contentStatusEnum, shootStatusEnum } from "./enums";
import { brands } from "./brands";
import { campaigns } from "./campaigns";
import { sbus } from "./sbus";
import { tasks } from "./tasks";
import { users } from "./users";

/**
 * SPEC Mục 4.2 / 7.2 / 9.6 `content_items` — Phase 2. Bảng tạo sẵn ở Phase 0 để
 * có FK ổn định; chưa build UI calendar hay tự sinh task con ở đợt MVP này.
 */
export const contentItems = pgTable(
  "content_items",
  {
    id: pkUuid(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    publishDate: date("publish_date").notNull(),
    publishTime: time("publish_time"),
    channel: text("channel").notNull(),
    contentPillar: text("content_pillar"),
    topic: text("topic").notNull(),
    targetAudience: text("target_audience"),
    keyMessage: text("key_message"),
    format: text("format"),
    resourceSource: text("resource_source"),
    ownerId: uuid("owner_id").references(() => users.id),
    cta: text("cta"),
    targetMetric: text("target_metric"),
    supportNeeded: text("support_needed"),
    status: contentStatusEnum("status").notNull().default("brief"),
    postUrl: text("post_url"),
    parentTaskId: uuid("parent_task_id").references(() => tasks.id),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [index("content_items_publish_idx").on(t.publishDate)],
);

/** SPEC Mục 4.2 / 7.3 / 9.7 `media_shoots` + `media_deliverables` — Phase 2. */
export const mediaShoots = pgTable("media_shoots", {
  id: pkUuid(),
  code: text("code").notNull().unique(),
  shootDate: date("shoot_date").notNull(),
  location: text("location"),
  sbuId: uuid("sbu_id").references(() => sbus.id),
  brandId: uuid("brand_id").references(() => brands.id),
  purpose: text("purpose"),
  crew: text("crew"),
  equipment: text("equipment"),
  scriptUrl: text("script_url"),
  status: shootStatusEnum("status").notNull().default("planned"),
  notes: text("notes"),
  ...auditColumns,
  ...softDeleteColumn,
});

export const mediaDeliverables = pgTable(
  "media_deliverables",
  {
    id: pkUuid(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => mediaShoots.id),
    deliverableType: text("deliverable_type").notNull(),
    quantity: integer("quantity").notNull().default(1),
    channel: text("channel"),
    brandId: uuid("brand_id").references(() => brands.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    editorId: uuid("editor_id").references(() => users.id),
    dueDate: date("due_date"),
    resultUrl: text("result_url"),
    ...auditColumns,
  },
  (t) => [index("media_deliverables_shoot_idx").on(t.shootId)],
);

export type ContentItem = typeof contentItems.$inferSelect;
export type MediaShoot = typeof mediaShoots.$inferSelect;
