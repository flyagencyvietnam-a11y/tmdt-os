import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /** Brand CHÍNH (= brandIds[0]) — dùng tra workflow template + gắn task. */
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    /** Mọi brand mà bài đăng thuộc về (1 post có thể chung nhiều brand). Luôn chứa brandId. */
    brandIds: uuid("brand_ids").array().notNull().default(sql`'{}'::uuid[]`),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    publishDate: date("publish_date").notNull(),
    publishTime: time("publish_time"),
    /** Kênh CHÍNH (= channels[0]). */
    channel: text("channel").notNull(),
    /** Mọi kênh đăng của bài (đăng chéo Fanpage + TikTok...). Luôn chứa channel. */
    channels: text("channels").array().notNull().default(sql`'{}'::text[]`),
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
    /** Khoá upsert khi import T6 (Mục 10.2). */
    externalKey: text("external_key"),
    importScope: text("import_scope"),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("content_items_publish_idx").on(t.publishDate),
    uniqueIndex("content_items_import_uniq")
      .on(t.importScope, t.externalKey)
      .where(sql`${t.externalKey} is not null and ${t.deletedAt} is null`),
  ],
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

/**
 * SPEC Mục 7.2 / 13.4 `content_workflow_template` — các bước task con tự sinh
 * cho 1 content_item ("Soạn nội dung", "Thiết kế", "Duyệt", "Đăng bài"...).
 * `brandId`/`channel` null = áp dụng mặc định khi không có template riêng.
 * `steps`: [{ label, offsetWorkdaysBeforePublish, assigneeId? }], theo thứ tự mảng.
 */
export const contentWorkflowTemplates = pgTable("content_workflow_templates", {
  id: pkUuid(),
  brandId: uuid("brand_id").references(() => brands.id),
  channel: text("channel"),
  steps: jsonb("steps").notNull(),
  ...auditColumns,
});

export type ContentItem = typeof contentItems.$inferSelect;
export type MediaShoot = typeof mediaShoots.$inferSelect;
export type ContentWorkflowTemplate = typeof contentWorkflowTemplates.$inferSelect;
