"use client";

import * as React from "react";

/**
 * State giao diện sống sót qua việc rời trang rồi bấm Back: bộ lọc/sắp xếp/nhóm của bảng, tab đang mở, thu gọn…
 * Lưu trong sessionStorage (mỗi tab trình duyệt một bộ, mất khi đóng tab — đúng ý "quay lại chỗ cũ").
 *
 * Đọc ở effect (không đọc trong useState) để HTML server và lần render đầu của client giống nhau → không lệch hydration.
 * `restored` = true sau khi đã nạp xong giá trị đã lưu (dùng để chặn ghi đè trước khi nạp).
 */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = React.useState<T>(initial);
  const [restored, setRestored] = React.useState(false);
  const fullKey = `vmg:ui:${key}`;

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(fullKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp ở effect (không phải lúc render) để HTML server và client khớp nhau
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // sessionStorage bị chặn / JSON hỏng → dùng giá trị mặc định
    }
    setRestored(true);
  }, [fullKey]);

  React.useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      // đầy bộ nhớ / bị chặn — bỏ qua
    }
  }, [fullKey, value, restored]);

  return [value, setValue, restored];
}

/** Đọc/ghi 1 số (vd. vị trí cuộn) trong sessionStorage — không gây re-render. */
export function readSessionNumber(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(`vmg:ui:${key}`);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
export function writeSessionNumber(key: string, n: number) {
  try {
    sessionStorage.setItem(`vmg:ui:${key}`, String(Math.round(n)));
  } catch {
    // bỏ qua
  }
}
