"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  date: string;
  spend: number;
  messages: number;
  mql: number;
  cpmql: number | null;
}

const compact = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}tr`
    : v >= 1000
      ? `${Math.round(v / 1000)}k`
      : String(Math.round(v));

export function AdsDailyChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            fontSize={11}
            stroke="var(--muted-foreground)"
            minTickGap={16}
          />
          <YAxis
            yAxisId="left"
            fontSize={11}
            stroke="var(--muted-foreground)"
            tickFormatter={compact}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            fontSize={11}
            stroke="var(--muted-foreground)"
            tickFormatter={compact}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={
              ((v: unknown, name: unknown) => {
                const num = Number(v);
                const label = String(name);
                if (label === "Tin nhắn" || label === "MQL") return [num, label];
                return [`${Math.round(num).toLocaleString("vi-VN")}đ`, label];
              }) as never
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="left"
            dataKey="spend"
            name="Spend"
            fill="var(--gold)"
            opacity={0.5}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="messages"
            name="Tin nhắn"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="mql"
            name="MQL"
            stroke="var(--ok)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="cpmql"
            name="CPMQL"
            stroke="var(--crit)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
