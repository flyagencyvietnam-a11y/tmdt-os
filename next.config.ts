import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (chế độ DEMO) & pg cần nạp từ node_modules, không bundle — để tài sản .wasm/.data
  // của PGlite resolve đúng. Không ảnh hưởng production (dùng postgres-js với DATABASE_URL).
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Các redirect "/hom-nay", "/ban-giao", "/bao-cao" từ dự án TMĐT OS cũ (đã khai tử — xem
  // CLAUDE.md) đã bị xoá: đích đến (/cong-viec, /lead) không tồn tại trong MKT OS, và
  // "/bao-cao" trùng tên với trang Dashboard quản lý mới (Mục 12.2) nên redirect cũ sẽ
  // nuốt route mới trước khi tới page.tsx — xoá hẳn thay vì sửa lại để tránh lặp lại.
};

export default nextConfig;
