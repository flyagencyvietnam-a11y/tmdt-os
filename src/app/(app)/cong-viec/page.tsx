import { PhasePlaceholder } from "@/components/shell/phase-placeholder";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <PhasePlaceholder title="Quản trị công việc" phase="Phase 3" spec="SPEC Mục 13" />
  );
}
