import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { brands } from "./brands";
import { sbuKindEnum, sbuRegionEnum } from "./enums";
import { users } from "./users";

/** SPEC Mục 4.2 `sbus` — đầu mối SBU (12 trung tâm/nhóm). */
export const sbus = pgTable(
  "sbus",
  {
    id: pkUuid(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    kind: sbuKindEnum("kind").notNull(),
    region: sbuRegionEnum("region").notNull(),
    /** SBU kiểu brand/sản phẩm trỏ tới brand tương ứng (để đồng bộ với content/campaign dùng brand). Trung tâm: null. */
    brandId: uuid("brand_id").references((): AnyPgColumn => brands.id),
    hoOwnerId: uuid("ho_owner_id").references((): AnyPgColumn => users.id),
    active: boolean("active").notNull().default(true),
    ...auditColumns,
  },
  (t) => [index("sbus_region_idx").on(t.region), index("sbus_owner_idx").on(t.hoOwnerId)],
);

export type Sbu = typeof sbus.$inferSelect;
export type NewSbu = typeof sbus.$inferInsert;
