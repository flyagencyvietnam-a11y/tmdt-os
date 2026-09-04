/**
 * Loading dùng chung cho mọi trang trong nhóm (app): hiện ngay khi điều hướng,
 * thay vì "đứng hình" ở trang cũ trong lúc server render trang mới (DB ở xa).
 */
export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="h-1 w-full overflow-hidden rounded bg-muted">
        <div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded bg-brand/70" />
      </div>
      <p className="text-sm text-muted-foreground">Đang tải…</p>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
      <style>{`@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
