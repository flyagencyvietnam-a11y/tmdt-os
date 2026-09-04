import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (chế độ DEMO) & pg cần nạp từ node_modules, không bundle — để tài sản .wasm/.data
  // của PGlite resolve đúng. Không ảnh hưởng production (dùng postgres-js với DATABASE_URL).
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async redirects() {
    return [
      // "Hôm nay" đã gộp vào Công việc (Gói D) — giữ redirect cho bookmark & thông báo cũ.
      { source: "/hom-nay", destination: "/cong-viec", permanent: false },
      // "Bàn giao EMS" gộp vào Lead (Gói C); "Báo cáo" gộp vào Dashboard (Gói A).
      // (/ads nay là trang "Theo dõi Ads" — Gói L, không còn redirect.)
      { source: "/ban-giao", destination: "/lead", permanent: false },
      { source: "/bao-cao", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
