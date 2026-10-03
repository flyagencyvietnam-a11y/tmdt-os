import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import { roleEnum, teamEnum } from "./enums";
import { sbus } from "./sbus";

/** SPEC Mục 4.2 `users`. */
export const users = pgTable(
  "users",
  {
    id: pkUuid(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: roleEnum("role").notNull(),
    team: teamEnum("team").notNull().default("ho_marketing"),
    /** Dùng cho `center_contributor` — trung tâm người này thuộc về. */
    sbuId: uuid("sbu_id").references((): AnyPgColumn => sbus.id),
    canAssign: boolean("can_assign").notNull().default(false),
    active: boolean("active").notNull().default(true),
    notificationPrefs: jsonb("notification_prefs").notNull().default({}),
    /** Mảng thứ trong tuần làm việc, 1=Thứ Hai..7=Chủ Nhật. Mặc định T2-T6. */
    workDays: integer("work_days").array().notNull().default([1, 2, 3, 4, 5]),
    avatarUrl: text("avatar_url"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("users_role_idx").on(t.role), index("users_sbu_idx").on(t.sbuId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
