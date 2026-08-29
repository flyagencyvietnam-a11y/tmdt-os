import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getFormRefs } from "@/lib/services/refs";
import { NewLeadForm } from "./new-lead-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập lead mới — VMG TMĐT OS" };

export default async function Page() {
  const user = await requireUser();
  if (!can(user.role, "lead", "create")) redirect("/khong-co-quyen");
  const refs = await getFormRefs(db);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Nhập lead mới</h1>
          <p className="text-sm text-muted-foreground">
            Chỉ 5 trường bắt buộc. SĐT không bắt buộc (SPEC Mục 11.3).
          </p>
        </div>
        <Link href="/lead" className="text-sm text-brand underline">
          ← Danh sách lead
        </Link>
      </div>
      <NewLeadForm refs={refs} currentUserId={user.id} />
    </div>
  );
}
