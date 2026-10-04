"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import * as React from "react";

/** Sáng/Tối theo lựa chọn từng người (lưu trình duyệt). Mặc định Sáng — giao diện đã quen. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
