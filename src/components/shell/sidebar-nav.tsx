"use client";

import {
  BarChart3,
  Bot,
  Building2,
  CalendarRange,
  ClipboardList,
  Clapperboard,
  Gauge,
  Inbox,
  Layers,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Newspaper,
  Settings,
  ShieldAlert,
  Upload,
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
}

/** SPEC Mục 8.1 — điều hướng chính, hiển thị theo quyền. */
const ITEMS: NavItem[] = [
  { href: "/", label: "Việc của tôi", icon: LayoutDashboard, roles: ["admin", "manager", "member", "center_contributor", "viewer"] },
  { href: "/task", label: "Tất cả task", icon: ClipboardList, roles: ["admin", "manager", "member"] },
  { href: "/gantt", label: "Gantt", icon: CalendarRange, roles: ["admin", "manager", "member"] },
  { href: "/workload", label: "Workload", icon: Gauge, roles: ["admin", "manager"] },
  { href: "/campaign", label: "Campaign", icon: Megaphone, roles: ["admin", "manager", "member", "viewer"] },
  { href: "/content", label: "Content", icon: Newspaper, roles: ["admin", "manager", "member"] },
  { href: "/quay-chup", label: "Quay chụp", icon: Clapperboard, roles: ["admin", "manager", "member"] },
  { href: "/request", label: "Request", icon: Inbox, roles: ["admin", "manager", "member", "center_contributor"] },
  { href: "/sbu", label: "SBU", icon: Building2, roles: ["admin", "manager", "member", "viewer", "center_contributor"] },
  { href: "/giam-sat", label: "Giám sát", icon: ShieldAlert, roles: ["admin", "manager", "member"] },
  { href: "/ads", label: "Ads hàng tháng", icon: LineChart, roles: ["admin", "manager"] },
  { href: "/nen-tang", label: "Nền tảng", icon: Layers, roles: ["admin", "manager", "member"] },
  { href: "/bao-cao", label: "Báo cáo", icon: BarChart3, roles: ["admin", "manager", "viewer"] },
  { href: "/tro-ly-ai", label: "Trợ lý AI", icon: Bot, roles: ["admin", "manager"] },
  { href: "/import", label: "Nhập liệu", icon: Upload, roles: ["admin", "manager"] },
  { href: "/nguoi-dung", label: "Người dùng", icon: Users, roles: ["admin"] },
  { href: "/cai-dat", label: "Cài đặt", icon: Settings, roles: ["admin"] },
];

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => i.roles.includes(role));

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
          </Link>
        );
      })}
    </nav>
  );
}
