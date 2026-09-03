"use client";

import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  Lock,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  phase?: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "MARKETING", "EC", "VIEWER"] },
  { href: "/hom-nay", label: "Hôm nay", icon: CalendarClock, roles: ["EC", "ADMIN", "MANAGER"], phase: "P1" },
  { href: "/lead", label: "Lead", icon: ClipboardList, roles: ["ADMIN", "MANAGER", "MARKETING", "EC"], phase: "P1" },
  { href: "/campaign", label: "Campaign", icon: Megaphone, roles: ["ADMIN", "MANAGER", "MARKETING", "EC", "VIEWER"], phase: "P1" },
  { href: "/cong-viec", label: "Công việc", icon: ClipboardList, roles: ["ADMIN", "MANAGER", "MARKETING", "EC"] },
  { href: "/kpi", label: "KPI", icon: Target, roles: ["ADMIN", "MANAGER", "MARKETING", "EC", "VIEWER"] },
  { href: "/sale-kit", label: "Sale Enablement", icon: Sparkles, roles: ["ADMIN", "MANAGER", "MARKETING", "EC"] },
  { href: "/bao-cao", label: "Báo cáo", icon: BarChart3, roles: ["ADMIN", "MANAGER"] },
  { href: "/cau-hinh", label: "Cấu hình sản phẩm", icon: SlidersHorizontal, roles: ["ADMIN", "MANAGER"] },
  { href: "/khoa-so", label: "Khóa sổ kỳ", icon: Lock, roles: ["ADMIN"] },
  { href: "/nguoi-dung", label: "Người dùng", icon: Users, roles: ["ADMIN"] },
  { href: "/audit", label: "Nhật ký kiểm toán", icon: ShieldCheck, roles: ["ADMIN", "MANAGER"] },
];

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => i.roles.includes(role));

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm",
              active
                ? "bg-brand/10 font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.phase && (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                {item.phase}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
