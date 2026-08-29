import Link from "next/link";

export const metadata = { title: "Không có quyền — VMG TMĐT OS" };

export default function Page() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Bạn không có quyền truy cập trang này</h1>
      <p className="text-sm text-muted-foreground">
        Nếu cho rằng đây là nhầm lẫn, liên hệ Trưởng phòng để điều chỉnh vai trò.
      </p>
      <Link href="/" className="text-sm text-brand underline">
        Về Dashboard
      </Link>
    </div>
  );
}
