import { PhasePlaceholder } from "@/components/shell/phase-placeholder";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <PhasePlaceholder
      title="Giao & quản trị KPI"
      phase="Phase 3"
      spec="SPEC Mục 14 — khớp cơ chế thưởng Q3 (30/30/40)"
    />
  );
}
