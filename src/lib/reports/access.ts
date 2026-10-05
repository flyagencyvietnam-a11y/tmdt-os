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

export function parsePeriod(v: string | null | undefined): string | undefined {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined;
}
