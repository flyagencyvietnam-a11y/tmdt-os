"use client";

import * as React from "react";

/** Thanh công cụ trang in (ẩn khi in): In / Lưu PDF, tải Excel, đóng. */
export function PrintToolbar({ excelHref, title }: { excelHref: string; title: string }) {
  React.useEffect(() => {
    // Mở bằng ?auto=1 thì bật hộp thoại in luôn (chọn "Lưu dưới dạng PDF").
    if (new URLSearchParams(window.location.search).get("auto") === "1") {
      const t = setTimeout(() => window.print(), 700);
      return () => clearTimeout(t);
    }
  }, []);
  return (
    <div className="report-toolbar">
      <strong>{title}</strong>
      <span className="report-toolbar-hint">Trong hộp thoại in chọn <b>Lưu dưới dạng PDF</b>, khổ A4, tắt “Header and footer”, bật “Background graphics”.</span>
      <span className="report-toolbar-spacer" />
      <button type="button" onClick={() => window.print()} className="rt-primary">
        In / Lưu PDF
      </button>
      <a href={excelHref} className="rt-btn">
        Tải Excel
      </a>
      <button type="button" onClick={() => window.close()} className="rt-btn">
        Đóng
      </button>
    </div>
  );
}
