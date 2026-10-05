import * as React from "react";
import { compactNumber, formatCell } from "@/lib/reports/format";
import { BRAND_COLORS, type BarsSection, type KpiSection, type ReportDoc, type TableSection, type TrendSection } from "@/lib/reports/types";

/**
 * Bản PDF của báo cáo: bố cục A4 để "In → Lưu thành PDF" (trang /in-bao-cao/[kind]). Cùng nguồn dữ liệu với bản Excel (ReportDoc).
 * Server component thuần — không cần JS phía trình duyệt, biểu đồ vẽ bằng HTML/SVG nên in ra sắc nét.
 */
export function ReportDocView({ doc }: { doc: ReportDoc }) {
  return (
    <article className="report-paper" data-orientation={doc.orientation}>
      <style>{`@page { size: A4 ${doc.orientation}; margin: 12mm 12mm 14mm; }`}</style>
      <header className="report-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/vmg-english-logo.png" alt="VMG English" className="report-logo" />
        <div className="report-head-text">
          <h1>{doc.title}</h1>
          <p className="report-sub">{doc.subtitle}</p>
          <p className="report-meta">
            <b>{doc.periodLabel}</b> · Xuất ngày {new Date(doc.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · {doc.generatedBy}
          </p>
        </div>
      </header>
      <div className="report-rule" />

      {doc.sections.map((s, i) => {
        switch (s.type) {
          case "kpis":
            return <Kpis key={i} s={s} />;
          case "table":
            return <Table key={i} s={s} />;
          case "bars":
            return <Bars key={i} s={s} />;
          case "trend":
            return <Trend key={i} s={s} />;
          case "text":
            return (
              <section key={i} className="report-block">
                {s.title && <h2>{s.title}</h2>}
                <p className="report-text">{s.body}</p>
              </section>
            );
        }
      })}

      {doc.footnotes && doc.footnotes.length > 0 && (
        <footer className="report-notes">
          {doc.footnotes.map((f, i) => (
            <p key={i}>• {f}</p>
          ))}
        </footer>
      )}
      <div className="report-fixed-foot">VMG MKT OS · {doc.title} · {doc.periodLabel}</div>
    </article>
  );
}

function Kpis({ s }: { s: KpiSection }) {
  return (
    <section className="report-kpis">
      {s.items.map((k) => (
        <div key={k.label} className={`report-kpi tone-${k.tone ?? "neutral"}`}>
          <div className="k-label">{k.label}</div>
          <div className="k-value">{k.value}</div>
          {k.sub && <div className="k-sub">{k.sub}</div>}
        </div>
      ))}
    </section>
  );
}

function heatRange(s: TableSection, key: string): [number, number] | null {
  const vals = s.rows.filter((r) => !r._kind).map((r) => r[key]).filter((v): v is number => typeof v === "number");
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return max > min ? [min, max] : null;
}

function Table({ s }: { s: TableSection }) {
  const heats = new Map(s.columns.filter((c) => c.heat).map((c) => [c.key, heatRange(s, c.key)] as const));
  const alignOf = (c: TableSection["columns"][number]) => c.align ?? (c.format && c.format !== "text" && c.format !== "date" ? "right" : "left");
  return (
    <section className="report-block">
      <h2>{s.title}</h2>
      {s.note && <p className="report-note">{s.note}</p>}
      <table className="report-table">
        <thead>
          <tr>
            {s.columns.map((c) => (
              <th key={c.key} style={{ textAlign: alignOf(c) }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i} className={r._kind ? `row-${r._kind}` : undefined}>
              {s.columns.map((c) => {
                const v = r[c.key];
                const range = heats.get(c.key);
                let bg: string | undefined;
                if (range && !r._kind && typeof v === "number") bg = `rgba(203,166,86,${(0.08 + 0.4 * ((v - range[0]) / (range[1] - range[0]))).toFixed(2)})`;
                return (
                  <td key={c.key} style={{ textAlign: alignOf(c), background: bg }}>
                    {formatCell(v, c.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {s.totals && (
          <tfoot>
            <tr>
              {s.columns.map((c) => (
                <td key={c.key} style={{ textAlign: alignOf(c) }}>
                  {formatCell(s.totals![c.key], c.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

function Bars({ s }: { s: BarsSection }) {
  const max = Math.max(1, ...s.items.map((i) => i.value));
  const total = s.items.reduce((a, b) => a + b.value, 0);
  return (
    <section className="report-block report-avoid-break">
      <h2>{s.title}</h2>
      {s.note && <p className="report-note">{s.note}</p>}
      <div className="report-bars">
        {s.items.map((i) => (
          <div key={i.label} className="bar-row">
            <div className="bar-label">{i.label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? BRAND_COLORS.red }} />
            </div>
            <div className="bar-value">
              {s.format === "money" ? compactNumber(i.value, true) : formatCell(i.value, s.format)}
              {total > 0 && s.format !== "pct" && <span className="bar-share"> · {Math.round((i.value / total) * 100)}%</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Trend({ s }: { s: TrendSection }) {
  const W = 760;
  const H = 230;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const n = s.periods.length;
  const stacked = s.mode !== "grouped";
  const totals = s.periods.map((_, i) => s.series.reduce((a, x) => a + (x.values[i] ?? 0), 0));
  const maxVal = stacked ? Math.max(1, ...totals) : Math.max(1, ...s.series.flatMap((x) => x.values.map((v) => v ?? 0)));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / Math.max(1, n);
  const barW = stacked ? Math.min(54, slot * 0.6) : Math.min(46, (slot * 0.8) / Math.max(1, s.series.length));
  const y = (v: number) => pad.t + innerH - (v / maxVal) * innerH;
  const money = s.format === "money";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);
  return (
    <section className="report-block report-avoid-break">
      <h2>{s.title}</h2>
      {s.note && <p className="report-note">{s.note}</p>}
      <div className="report-legend">
        {s.series.map((x) => (
          <span key={x.label}>
            <i style={{ background: x.color }} /> {x.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="report-chart" role="img" aria-label={s.title}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6b7280">
              {compactNumber(t, money)}
            </text>
          </g>
        ))}
        {s.periods.map((p, i) => {
          const cx = pad.l + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={p}>
              {s.series.map((x, si) => {
                const v = x.values[i];
                if (v == null || v <= 0) return null;
                if (stacked) {
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return <rect key={x.label} x={cx - barW / 2} y={top} width={barW} height={Math.max(0, h)} fill={x.color} stroke="#fff" strokeWidth="0.6" />;
                }
                const gx = cx - (barW * s.series.length) / 2 + barW * si;
                return <rect key={x.label} x={gx} y={y(v)} width={barW - 2} height={Math.max(0, y(0) - y(v))} fill={x.color} />;
              })}
              {stacked && totals[i] > 0 && (
                <text x={cx} y={y(totals[i]) - 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="#374151">
                  {compactNumber(totals[i], money)}
                </text>
              )}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill="#374151">
                {p}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
