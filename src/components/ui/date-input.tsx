"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";
import { MAX_SANE_YEAR, MIN_SANE_YEAR } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Ô nhập ngày LUÔN hiển thị dd/mm/yyyy (không phụ thuộc ngôn ngữ trình duyệt/hệ điều hành như
 * `<input type="date">`). Giá trị vào/ra là chuỗi ISO `yyyy-mm-dd` (hoặc "" khi trống) — khớp cột `date` của DB.
 * Gõ số tự chèn dấu "/"; có nút lịch mở bộ chọn ngày gốc của trình duyệt.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoToDmy(iso: string | null | undefined): string {
  const m = iso ? ISO.exec(iso.slice(0, 10)) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "05/10/2026" | "5/10/26" | "05102026" → "2026-10-05"; không hợp lệ → null. */
export function dmyToIso(text: string): string | null {
  const t = text.trim();
  let d: string, mo: string, y: string;
  const parts = t.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length === 3) [d, mo, y] = parts;
  else if (parts.length === 1 && /^\d{8}$/.test(parts[0])) [d, mo, y] = [parts[0].slice(0, 2), parts[0].slice(2, 4), parts[0].slice(4)];
  else return null;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(mo) || !/^\d{2}$|^\d{4}$/.test(y)) return null;
  const yy = y.length === 2 ? 2000 + Number(y) : Number(y);
  if (yy < MIN_SANE_YEAR || yy > MAX_SANE_YEAR) return null; // chặn gõ nhầm năm (vd. 1020)
  const dt = new Date(Date.UTC(yy, Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${String(yy).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tự chèn "/" khi gõ liền số: 05102026 → 05/10/2026. */
function mask(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export interface DateInputProps {
  value: string | null | undefined;
  onChange: (iso: string) => void;
  /** Gọi khi rời ô / Enter — dùng cho ô sửa tại chỗ. */
  onCommit?: (iso: string) => void;
  onCancel?: () => void;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
}

export function DateInput({ value, onChange, onCommit, onCancel, className, disabled, autoFocus, id, placeholder = "dd/mm/yyyy", ...rest }: DateInputProps) {
  const [text, setText] = React.useState(() => isoToDmy(value));
  const [invalid, setInvalid] = React.useState(false);
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const lastEmitted = React.useRef<string>(value ?? "");

  // Đồng bộ khi giá trị bên ngoài đổi (không phải do chính mình vừa phát ra).
  React.useEffect(() => {
    if ((value ?? "") !== lastEmitted.current) {
      lastEmitted.current = value ?? "";
      setText(isoToDmy(value));
      setInvalid(false);
    }
  }, [value]);

  function emit(iso: string) {
    lastEmitted.current = iso;
    onChange(iso);
  }

  function resolve(commit: boolean) {
    const t = text.trim();
    if (!t) {
      setInvalid(false);
      if (commit) onCommit?.("");
      return;
    }
    const iso = dmyToIso(t);
    if (!iso) {
      setInvalid(true);
      if (commit) {
        // Ngày sai khi rời ô → trả về giá trị cũ, không lưu bậy.
        setText(isoToDmy(value));
        setInvalid(false);
        onCancel?.();
      }
      return;
    }
    setInvalid(false);
    setText(isoToDmy(iso));
    if (iso !== (value ?? "")) emit(iso);
    if (commit) onCommit?.(iso);
  }

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        aria-label={rest["aria-label"]}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const next = mask(e.target.value);
          setText(next);
          if (next === "") {
            setInvalid(false);
            emit("");
          } else if (next.length === 10) {
            const iso = dmyToIso(next);
            setInvalid(!iso);
            if (iso) emit(iso);
          } else setInvalid(false);
        }}
        onBlur={() => resolve(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            resolve(true);
          }
          if (e.key === "Escape") {
            setText(isoToDmy(value));
            onCancel?.();
          }
        }}
        className={cn(
          "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-8 text-sm tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Chọn ngày từ lịch"
        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        // mousedown để không làm ô chữ mất focus (và kích hoạt blur) trước khi mở lịch
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
            el.click();
          }
        }}
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
      {/* Bộ chọn ngày gốc — chỉ để lấy giá trị, không hiện */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value && ISO.test(value.slice(0, 10)) ? value.slice(0, 10) : ""}
        onChange={(e) => {
          setText(isoToDmy(e.target.value));
          setInvalid(false);
          emit(e.target.value);
          onCommit?.(e.target.value);
        }}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}

/** Ô nhập tháng hiển thị mm/yyyy, giá trị "yyyy-mm". */
export function MonthInput({ value, onChange, className, disabled, id, autoFocus, placeholder = "mm/yyyy" }: { value: string | null | undefined; onChange: (ym: string) => void; className?: string; disabled?: boolean; id?: string; autoFocus?: boolean; placeholder?: string }) {
  const toText = (v: string | null | undefined) => {
    const m = v ? /^(\d{4})-(\d{2})/.exec(v) : null;
    return m ? `${m[2]}/${m[1]}` : "";
  };
  const [text, setText] = React.useState(() => toText(value));
  const last = React.useRef(value ?? "");
  React.useEffect(() => {
    if ((value ?? "") !== last.current) {
      last.current = value ?? "";
      setText(toText(value));
    }
  }, [value]);
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 6);
        const next = digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
        setText(next);
        const m = /^(\d{2})\/(\d{4})$/.exec(next);
        if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
          last.current = `${m[2]}-${m[1]}`;
          onChange(last.current);
        }
      }}
      onBlur={() => setText(toText(value))}
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
        className,
      )}
    />
  );
}
