import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid, softDeleteColumn } from "./_shared";
import { leads } from "./leads";
import { products } from "./products";
import { users } from "./users";

/**
 * SPEC Mục 7.8. Doanh thu tách bảng riêng: một lead có thể mua nhiều lần / trả góp nhiều đợt.
 *
 * Ràng buộc nghiệp vụ (enforce ở service, SPEC Mục 7.8 + V04):
 *   Tạo enrollment ĐẦU TIÊN cho một lead => tự đặt lead.outcome = WON, stage = WON,
 *   won_at = contract_date. Không cho đặt outcome = WON bằng tay nếu chưa có enrollment.
 *
 * QĐ05: `credited_to` = người được tính HVM/doanh thu (assigned_to tại thời điểm tạo).
 */
export const enrollments = pgTable(
  "enrollments",
  {
    id: pkUuid(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    /** Có thể khác sản phẩm quan tâm ban đầu. */
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    contractDate: date("contract_date").notNull(),
    /** Doanh thu gộp trước giảm trừ, VND. > 0 (check constraint). */
    grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
    discountAmount: bigint("discount_amount", { mode: "number" }).notNull().default(0),
    /** GENERATED: gross_amount - discount_amount. */
    netAmount: bigint("net_amount", { mode: "number" }).generatedAlwaysAs(
      sql`gross_amount - discount_amount`,
    ),
    /** Tiền thực thu, phục vụ KPI "Tiền thu". */
    collectedAmount: bigint("collected_amount", { mode: "number" })
      .notNull()
      .default(0),
    /** Số HVM ghi nhận. Phục vụ KPI HVM + thưởng 50.000đ/HVM. */
    studentCount: integer("student_count").notNull().default(1),
    /** QĐ05 — người được tính công. */
    creditedTo: uuid("credited_to").references(() => users.id),
    /** Mã học viên bên DotB EMS sau khi bàn giao. */
    emsStudentId: text("ems_student_id"),
    note: text("note"),
    /** Cần EC bổ sung doanh thu thật (SPEC Mục 19.2 bước 6). */
    needsRevenueConfirmation: text("needs_revenue_confirmation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...softDeleteColumn,
  },
  (t) => [
    index("enrollments_lead_idx").on(t.leadId),
    index("enrollments_contract_date_idx").on(t.contractDate),
    index("enrollments_product_idx").on(t.productId),
    index("enrollments_credited_idx").on(t.creditedTo),
    check("enrollments_gross_positive", sql`${t.grossAmount} > 0`),
    check("enrollments_discount_nonneg", sql`${t.discountAmount} >= 0`),
    check("enrollments_collected_nonneg", sql`${t.collectedAmount} >= 0`),
    check("enrollments_student_count_positive", sql`${t.studentCount} > 0`),
    // V11: tiền thực thu không vượt doanh thu ròng (net_amount là generated -> viết tường minh).
    check(
      "enrollments_collected_le_net",
      sql`${t.collectedAmount} <= ${t.grossAmount} - ${t.discountAmount}`,
    ),
  ],
);

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
