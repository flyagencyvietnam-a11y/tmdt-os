"use client";

import { FileSpreadsheet, Paperclip, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Ô chọn file thay cho <input type="file"> mặc định (chữ tiếng Anh "Choose File",
 * không thấy rõ đã chọn gì). Vẫn là input thật bên trong nên `ref.current.files`
 * dùng y như cũ; hỗ trợ kéo-thả file vào.
 */
export function FileInput({ ref, accept, className }: { ref: React.RefObject<HTMLInputElement | null>; accept?: string; className?: string }) {
  const [name, setName] = React.useState<string | null>(null);
  const [over, setOver] = React.useState(false);

  function setFiles(files: FileList | null) {
    if (!ref.current || !files?.length) return;
    ref.current.files = files;
    setName(files[0].name);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex h-9 min-w-64 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm transition-colors hover:border-brand/50 hover:bg-brand/5",
        over && "border-brand bg-brand/10",
        name && "border-solid bg-muted/40",
        className,
      )}
    >
      <input ref={ref} type="file" accept={accept} className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      {name ? <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /> : <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={cn("truncate", !name && "text-muted-foreground")}>{name ?? `Chọn hoặc kéo thả file ${accept?.replaceAll(",", " / ") ?? ""}`}</span>
      {name && (
        <button
          type="button"
          aria-label="Bỏ chọn file"
          className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            if (ref.current) ref.current.value = "";
            setName(null);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
}
