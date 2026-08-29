import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import { roleEnum } from "./enums";

/** SPEC Mục 7.1 */
export const users = pgTable(
  "users",
  {
    id: pkUuid(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    /** Chức danh — dùng trong tài liệu & báo cáo (SPEC Mục 3.1). */
    jobTitle: text("job_title").notNull(),
    role: roleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    /** Phải đổi mật khẩu ở lần đăng nhập đầu — SPEC Mục 18.3. */
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    /** Biến thể tên cũ trên sheet, phục vụ migration: ví dụ ['Kien','Kiên']. */
    aliasNames: text("alias_names").array(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
