import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VMG MKT OS",
  description: "Hệ thống quản lý task & kế hoạch — Phòng Marketing VMG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-full flex flex-col font-sans [font-variant-numeric:tabular-nums]">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
