/**
 * SPEC Mục 14.4 (Phase 3) — "Trợ lý AI: gợi ý tách một tài liệu kế hoạch thành
 * danh sách action plan để nạp, LUÔN có bước người duyệt." Đây KHÔNG được tự
 * ghi task: chỉ trả về gợi ý, người dùng xem/sửa rồi mới bấm xác nhận tạo
 * (dùng `createTask` của task engine, không bypass bất kỳ kiểm tra quyền nào).
 *
 * Cần biến môi trường `ANTHROPIC_API_KEY` — CLAUDE.md "KHÔNG ĐƯỢC BỊA DỮ KIỆN":
 * nếu thiếu, tính năng vô hiệu rõ ràng thay vì giả vờ hoạt động.
 */

export interface SuggestedAction {
  title: string;
  dueDate: string | null; // YYYY-MM-DD nếu suy luận được từ văn bản
  assigneeNameGuess: string | null;
  priority: "urgent" | "high" | "medium" | "low";
  channel: string | null;
  notes: string | null;
}

export function isAiAssistConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT = `Bạn giúp một trưởng phòng Marketing tách một tài liệu kế hoạch (tiếng Việt) thành danh sách action/task cụ thể.
Chỉ trả về JSON hợp lệ, KHÔNG kèm giải thích, đúng dạng:
{"actions":[{"title":"...", "dueDate": "YYYY-MM-DD" | null, "assigneeNameGuess": "tên người (nếu văn bản có nêu)" | null, "priority": "urgent"|"high"|"medium"|"low", "channel": "kênh nếu có" | null, "notes": "ghi chú thêm nếu có" | null}]}
Quy tắc: KHÔNG bịa ngày tháng hay tên người không có trong văn bản — để null nếu không chắc. Giữ tiêu đề ngắn gọn, hành động cụ thể (bắt đầu bằng động từ khi hợp lý). Tối đa 100 action.`;

export async function parsePlanTextToActions(planText: string): Promise<SuggestedAction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình ANTHROPIC_API_KEY — tính năng Trợ lý AI chưa bật.");
  }
  if (!planText.trim()) throw new Error("Chưa có nội dung kế hoạch để phân tích.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: planText.slice(0, 20000) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gọi Anthropic API lỗi (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Không đọc được phản hồi của AI (không phải JSON).");

  let parsed: { actions?: unknown[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Phản hồi AI không phải JSON hợp lệ.");
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  return actions.slice(0, 100).map((a) => normalizeAction(a as Record<string, unknown>));
}

function normalizeAction(a: Record<string, unknown>): SuggestedAction {
  const priority = ["urgent", "high", "medium", "low"].includes(String(a.priority))
    ? (a.priority as SuggestedAction["priority"])
    : "medium";
  return {
    title: String(a.title ?? "").slice(0, 300) || "(chưa có tiêu đề)",
    dueDate: typeof a.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : null,
    assigneeNameGuess: typeof a.assigneeNameGuess === "string" ? a.assigneeNameGuess : null,
    priority,
    channel: typeof a.channel === "string" ? a.channel : null,
    notes: typeof a.notes === "string" ? a.notes : null,
  };
}
