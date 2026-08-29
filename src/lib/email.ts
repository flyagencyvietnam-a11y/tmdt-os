import nodemailer from "nodemailer";

/**
 * Gửi email cảnh báo — SPEC Mục 17.1 (Phase 2, cho mức CRITICAL).
 * Chưa cấu hình SMTP -> chỉ ghi log, không lỗi.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    console.log(
      `[email] (SMTP chưa cấu hình) to=${opts.to} subject="${opts.subject}"`,
    );
    return { sent: false };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "VMG TMĐT OS <no-reply@vmg.local>",
      to: Array.isArray(opts.to) ? opts.to.join(",") : opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { sent: true };
  } catch (e) {
    console.error("[email] gửi lỗi", e);
    return { sent: false };
  }
}
