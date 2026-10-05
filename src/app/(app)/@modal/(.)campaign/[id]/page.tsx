import { RouteModal } from "@/components/shell/route-modal";
import CampaignDetailPage from "@/app/(app)/campaign/[id]/page";

export const dynamic = "force-dynamic";

export default async function CampaignModal(props: { params: Promise<{ id: string }> }) {
  return (
    <RouteModal title="Chi tiết campaign">
      <CampaignDetailPage {...props} />
    </RouteModal>
  );
}
