/**
 * Nạp biến môi trường cho các script chạy ngoài Next.js.
 * Next tự đọc .env.local; `dotenv/config` thì KHÔNG — nó chỉ đọc `.env`.
 * Ở đây nạp cả hai, `.env.local` đè `.env` (giống thứ tự ưu tiên của Next).
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });
