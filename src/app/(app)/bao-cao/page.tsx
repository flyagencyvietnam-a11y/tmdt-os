import { PhasePlaceholder } from "@/components/shell/phase-placeholder";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN", "MANAGER");
  return (
    <PhasePlaceholder
      title="Báo cáo & xuất dữ liệu"
      phase="Phase 2"
      spec="SPEC Mục 12 / 16"
    />
  );
}
