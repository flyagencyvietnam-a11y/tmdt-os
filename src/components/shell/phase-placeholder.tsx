import { Construction } from "lucide-react";

export function PhasePlaceholder({
  title,
  phase,
  spec,
  children,
}: {
  title: string;
  phase: string;
  spec?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {spec && (
          <p className="text-sm text-muted-foreground">Đặc tả: {spec}</p>
        )}
      </div>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Construction className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div className="text-sm">
          <p className="font-medium">Màn hình này thuộc {phase}.</p>
          <p className="text-muted-foreground">
            Nền tảng Phase 0 (schema, phân quyền, tầng công thức, Data Grid) đã sẵn
            sàng. Các module nghiệp vụ sẽ được dựng theo lộ trình SPEC Mục 21.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
