import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
  {
    // Script dev-tooling: cho phép `any` khi bóc tách hình dạng cell ExcelJS / kết quả raw.
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Tầng service nhận nhiều loại drizzle db (postgres-js / pglite) qua một type chung.
    files: ["src/lib/services/metrics.ts", "src/lib/db/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
