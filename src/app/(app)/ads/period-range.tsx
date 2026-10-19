"use client";

import * as React from "react";
import { SimpleSelect } from "@/components/ui/simple-select";
import { useSessionState } from "@/lib/use-session-state";
import { Segmented } from "./ads-ui";

const NONE: string[] = [];

export interface PeriodRangeConfig {
  /** Khoá nhớ lựa chọn trong phiên (mỗi loại báo cáo một khoá). */
  storageKey: string;
  /** Các kỳ đã có số liệu. */
  dataKeys: string[];
  /** Kỳ thêm tay (vd. cột tuần vừa bấm "Thêm tuần" chưa có số). */
  extraKeys?: string[];
  /** Kỳ hiện tại (hôm nay thuộc kỳ nào) — danh sách kéo dài tới ít nhất kỳ này. */
  current: string;
  next: (k: string) => string;
  /** Nhãn đầy đủ của 1 kỳ (ô chọn). */
  label: (k: string) => string;
  /** Mô tả khoảng đã chọn, vd. "tuần 03/10 – 09/10/2026" hoặc "T4/2026 – T9/2026 (6 tháng)". */
  rangeText: (from: string, to: string, count: number) => string;
  /** Tên đơn vị kỳ ở chữ thường: "tuần" | "tháng" | "quý". */
  unit: string;
  /** Các nút chọn nhanh; 0 = tất cả. */
  presets: number[];
  defaultCount: number;
  footer?: string;
}

/**
 * Chọn KHOẢNG kỳ (Từ – Đến) cho báo cáo tuần / tháng / quý. Danh sách kỳ liền mạch từ kỳ có số liệu đầu tiên đến kỳ hiện tại (kỳ chưa
 * có số vẫn chọn/nhập được). Mặc định = `defaultCount` kỳ kết thúc ở kỳ có số liệu mới nhất. "Kỳ cuối" = kỳ đến, so với kỳ liền trước;
 * thẻ KPI = TỔNG cả khoảng, so với khoảng liền trước có CÙNG số kỳ (không đủ kỳ để so thì không có Δ).
 */
export function usePeriodRange(cfg: PeriodRangeConfig) {
  const { storageKey, dataKeys, extraKeys = NONE, current, next, label, rangeText, unit, presets, defaultCount, footer } = cfg;
  const [sel, setSel] = useSessionState<{ from: string | null; to: string | null }>(`ads:range:${storageKey}`, { from: null, to: null });
  const known = React.useMemo(() => [...new Set([...dataKeys, ...extraKeys])].sort(), [dataKeys, extraKeys]);
  const options = React.useMemo(() => {
    if (known.length === 0) return [] as string[];
    const end = known[known.length - 1] > current ? known[known.length - 1] : current;
    const out = new Set(known);
    for (let k = known[0], i = 0; k <= end && i < 400; k = next(k), i++) out.add(k);
    return [...out].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, current]);

  const latestData = known[known.length - 1];
  const to = sel.to && options.includes(sel.to) ? sel.to : (latestData ?? options[options.length - 1]);
  const toIdx = options.indexOf(to);
  const defaultFrom = options[Math.max(0, toIdx - (defaultCount - 1))];
  const from = sel.from && options.includes(sel.from) && sel.from <= to ? sel.from : defaultFrom;
  const shown = React.useMemo(() => options.filter((k) => k >= from && k <= to), [options, from, to]);
  const prevShown = React.useMemo(() => {
    const fromIdx = options.indexOf(from);
    const prevCandidate = options.slice(Math.max(0, fromIdx - shown.length), fromIdx);
    return shown.length > 0 && prevCandidate.length === shown.length ? prevCandidate : [];
  }, [options, from, shown]);
  const rangeLabel = rangeText(from, to, shown.length);
  const rangeHint = prevShown.length ? (shown.length === 1 ? `vs ${unit} trước` : `vs ${shown.length} ${unit} trước đó`) : shown.length > 1 ? `Tổng ${shown.length} ${unit} đã chọn` : undefined;

  const anchor = latestData ?? to;
  const presetFrom = (n: number) => (n === 0 ? options[0] : options[Math.max(0, options.indexOf(anchor) - (n - 1))]);
  const activePreset = presets.find((n) => to === anchor && from === presetFrom(n)) ?? -1;
  const opts = options.map((k) => ({ value: k, label: label(k) }));

  const picker =
    options.length === 0 ? null : (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <span className="px-1 text-xs font-medium text-muted-foreground">Khoảng {unit}</span>
        <Segmented value={activePreset} onChange={(n) => setSel({ from: presetFrom(n), to: anchor })} options={presets.map((n) => ({ value: n as number, label: n ? `${n} ${unit} gần nhất` : "Tất cả" }))} />
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Từ
          <SimpleSelect triggerClassName="h-8 w-44" value={from} onValueChange={(v) => v && setSel({ from: v, to: v > to ? v : to })} options={opts} />
          đến
          <SimpleSelect triggerClassName="h-8 w-44" value={to} onValueChange={(v) => v && setSel({ from: v < from ? v : from, to: v })} options={opts} />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {shown.length} {unit}
          {footer ? ` · ${footer}` : ""}
        </span>
      </div>
    );

  return { options, shown, prevShown, rangeLabel, rangeHint, latest: options.length ? to : undefined, picker, from, to, setRange: (f: string, t: string) => setSel({ from: f, to: t }) };
}
