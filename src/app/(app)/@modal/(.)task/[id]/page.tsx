import { RouteModal } from "@/components/shell/route-modal";
import TaskDetailPage from "@/app/(app)/task/[id]/page";

export const dynamic = "force-dynamic";

/** Task mở dạng popup đè lên trang đang xem (danh sách/Kanban/lịch giữ nguyên phía sau). Mở trực tiếp bằng link → trang đầy đủ. */
export default async function TaskModal(props: { params: Promise<{ id: string }> }) {
  return (
    <RouteModal title="Chi tiết task">
      <TaskDetailPage {...props} />
    </RouteModal>
  );
}
