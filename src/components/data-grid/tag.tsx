import * as React from "react";
import { cn } from "@/lib/utils";

/** Bảng màu cho giá trị danh mục (single-select kiểu Airtable). */
export type TagColor =
  | "slate"
  | "gray"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "rose";

export const TAG_CLASS: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
  lime: "bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

const DOT_CLASS: Record<TagColor, string> = {
  slate: "bg-slate-400",
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
};

export function Tag({
  color,
  children,
  className,
}: {
  color?: TagColor;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium",
        color ? TAG_CLASS[color] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Chấm màu nhỏ — cho danh sách chọn trong bộ lọc. */
export function TagDot({ color }: { color?: TagColor }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        color ? DOT_CLASS[color] : "bg-muted-foreground/40",
      )}
    />
  );
}
