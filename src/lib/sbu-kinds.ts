/**
 * SBU = trung tâm (offline/online) HOẶC brand/sản phẩm (VMG, VMG IELTS, VMG TESOL, VMG Tiếng Trung, VMP, VMT, UpLearn…).
 * Hằng số + hàm THUẦN, dùng được ở cả client lẫn server.
 */
export type SbuKind = "center" | "online_center" | "brand" | "group";

export const SBU_KIND_LABEL: Record<string, string> = {
  center: "Trung tâm",
  online_center: "Trung tâm online",
  brand: "Brand / sản phẩm",
  group: "Khác",
};

export const SBU_REGION_LABEL: Record<string, string> = {
  KV1: "Khu vực 1",
  KV2: "Khu vực 2",
  KV3: "Khu vực 3",
  KV2_KV3: "Khu vực 2/3",
  ONLINE: "Online",
  RND: "Khác",
  BRAND: "Brand / sản phẩm",
};

export const SBU_REGION_COLOR: Record<string, "blue" | "violet" | "purple" | "indigo" | "emerald" | "slate" | "amber"> = {
  KV1: "blue",
  KV2: "violet",
  KV3: "purple",
  KV2_KV3: "indigo",
  ONLINE: "emerald",
  RND: "slate",
  BRAND: "amber",
};

export const isBrandSbu = (s: { kind: string }) => s.kind === "brand";

/**
 * SBU tham gia các checklist "mỗi trung tâm" của việc lặp (Google Maps, POSM, Content Plan…) và ma trận hạng mục:
 * mọi trung tâm + brand nào ĐÃ có người phụ trách HO (VMP). Brand mới thêm (chưa có HO phụ trách) không bị kéo vào
 * để khỏi sinh checklist/task "chưa giao".
 */
export const isFanOutSbu = (s: { kind: string; hoOwnerId: string | null }) => s.kind !== "brand" || s.hoOwnerId != null;
