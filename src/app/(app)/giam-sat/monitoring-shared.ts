export type Alert = "overdue" | "due_soon" | "ok" | "no_data";

export interface PhotoItem {
  id: string;
  caption: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MonitoringRow {
  id: string;
  sbuId: string;
  kind: string;
  title: string;
  currentStateNote: string | null;
  lastUpdatedDate: string | null;
  cycleMonths: number;
  photoUrl: string | null;
  alert: Alert;
  nextDue: string | null;
  checkCount: number;
  photos: PhotoItem[];
}

export interface SbuLite {
  id: string;
  code: string;
  name: string;
  region: string;
}

export const ALERT_LABELS: Record<Alert, string> = { overdue: "Quá hạn", due_soon: "Sắp đến hạn", ok: "Còn hạn", no_data: "Chưa rà soát" };

export const KIND_LABELS: Record<string, string> = {
  posm: "POSM",
  signage: "Bảng hiệu",
  ooh: "OOH",
  google_maps: "Google Maps",
  vmp_booth: "Quầy tư vấn VMP",
  exam_room: "Phòng thi",
  other: "Khác",
};

/** Thứ tự hiển thị các nhóm trong 1 SBU. */
export const KIND_ORDER = ["posm", "signage", "ooh", "google_maps", "vmp_booth", "exam_room", "other"];

/** Gợi ý ô nhập hiện trạng theo loại hạng mục. */
export const STATE_PLACEHOLDER: Record<string, string> = {
  posm: "Đang hiển thị gì? VD: Standee khai giảng hè, còn tốt / bạc màu…",
  signage: "Hiện trạng bảng hiệu: nội dung đang hiển thị, tình trạng đèn/khung…",
  ooh: "Vị trí, nội dung đang chạy, thời hạn hợp đồng…",
  google_maps: "Điểm sao, số review mới, review xấu cần phản hồi, thông tin giờ mở cửa/SĐT đã đúng chưa…",
  vmp_booth: "Hiện trạng quầy: tài liệu, standee, nhân sự trực…",
  exam_room: "Hiện trạng phòng thi: thiết bị, bảng biển, vệ sinh…",
  other: "Hiện trạng đang hiển thị…",
};
