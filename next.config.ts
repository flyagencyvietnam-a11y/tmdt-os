import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (chế độ DEMO) & pg cần nạp từ node_modules, không bundle — để tài sản .wasm/.data
  // của PGlite resolve đúng. Không ảnh hưởng production (dùng postgres-js với DATABASE_URL).
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
