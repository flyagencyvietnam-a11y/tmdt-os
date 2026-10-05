import { RouteModal } from "@/components/shell/route-modal";
import SbuDetailPage from "@/app/(app)/sbu/[id]/page";

export const dynamic = "force-dynamic";

export default async function SbuModal(props: { params: Promise<{ id: string }> }) {
  return (
    <RouteModal title="Chi tiết SBU">
      <SbuDetailPage {...props} />
    </RouteModal>
  );
}
