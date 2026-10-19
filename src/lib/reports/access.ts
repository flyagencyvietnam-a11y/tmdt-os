import { canSee, type Role } from "@/lib/auth/permissions";
import type { ReportKind } from "./types";

/** Ai được xuất báo cáo nào (khớp quyền xem trang tương ứng). */
export function canExportReport(role: Role, kind: ReportKind): boolean {
  switch (kind) {
    case "brand":
      return canSee(role, "brandPerformance");
    case "growth":
      return canSee(role, "ads");
    case "management":
      return canSee(role, "managementDashboard");
    case "sbu":
      return role !== "center_contributor" && canSee(role, "sbu");
  }
}

export function parseKind(v: string | null | undefined): ReportKind | null {
  return v === "sbu" || v === "brand" || v === "growth" || v === "management" ? v : null;
}

/** Kỳ báo cáo: tháng yyyy-mm; riêng báo cáo Growth nhận thêm quý yyyy-Qn (cộng 3 tháng). */
export function parsePeriod(v: string | null | undefined, kind?: ReportKind | null): string | undefined {
  if (!v) return undefined;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  return kind === "growth" && /^\d{4}-Q[1-4]$/.test(v) ? v : undefined;
}
