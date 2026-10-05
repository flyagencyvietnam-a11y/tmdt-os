import { notFound, redirect } from "next/navigation";
import { ReportDocView } from "@/components/report/report-doc-view";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canExportReport, parseKind, parsePeriod } from "@/lib/reports/access";
import { buildReport } from "@/lib/reports/builders";
import { PrintToolbar } from "../print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo — VMG MKT OS" };

/** Trang báo cáo dạng PDF: /in-bao-cao/{sbu|brand|growth|management}?period=yyyy-mm[&auto=1] */
export default async function ReportPrintPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ period?: string }> }) {
  const [{ kind: kindParam }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const kind = parseKind(kindParam);
  if (!kind) notFound();
  if (!canExportReport(user.role, kind)) redirect("/khong-co-quyen");
  const period = parsePeriod(sp.period);
  const doc = await buildReport(db, kind, { period, userName: user.fullName });
  const excelHref = `/api/export/report?kind=${kind}${period ? `&period=${period}` : ""}`;
  return (
    <>
      <PrintToolbar excelHref={excelHref} title={doc.title} />
      <ReportDocView doc={doc} />
    </>
  );
}
