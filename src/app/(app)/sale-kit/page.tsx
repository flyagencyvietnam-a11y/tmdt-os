import { PhasePlaceholder } from "@/components/shell/phase-placeholder";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <PhasePlaceholder title="Sale Enablement" phase="Phase 3" spec="SPEC Mục 15" />
  );
}
