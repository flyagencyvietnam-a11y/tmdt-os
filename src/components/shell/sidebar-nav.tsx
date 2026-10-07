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
  Menu,
  Newspaper,
  Settings,
  Sparkles,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import type { Role } from "@/lib/auth/permissions";
import type { NavBadge, NavBadges } from "@/lib/nav-badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "manager", "member", "center_contributor", "viewer"];
const STAFF: Role[] = ["admin", "manager", "member"];

/** Điều hướng chính, nhóm theo luồng công việc, hiển thị theo quyền. */
const GROUPS: NavGroup[] = [
  {
    label: "Công việc",
    items: [
      { href: "/", label: "Việc của tôi", icon: LayoutDashboard, roles: ALL },
      { href: "/task", label: "Tất cả task", icon: ClipboardList, roles: STAFF },
      { href: "/request", label: "Request", icon: Inbox, roles: ["admin", "manager", "member", "center_contributor"] },
      { href: "/gantt", label: "Gantt", icon: CalendarRange, roles: STAFF },
      { href: "/workload", label: "Workload", icon: Gauge, roles: STAFF },
    ],
  },
  {
    label: "Kế hoạch",
    items: [
      { href: "/campaign", label: "Campaign", icon: Megaphone, roles: ["admin", "manager", "member", "viewer"] },
      { href: "/content", label: "Content", icon: Newspaper, roles: STAFF },
      { href: "/quay-chup", label: "Quay chụp", icon: Clapperboard, roles: STAFF },
      { href: "/nen-tang", label: "Nền tảng brand", icon: Layers, roles: STAFF },
    ],
  },
  {
    label: "Vận hành & số liệu",
    items: [
      { href: "/brand-performance", label: "Brand Performance", icon: Sparkles, roles: [...STAFF, "viewer"] },
      { href: "/ads", label: "Growth Performance", icon: LineChart, roles: [...STAFF, "viewer"] },
      { href: "/bao-cao", label: "Báo cáo", icon: BarChart3, roles: ["admin", "manager", "member", "viewer"] },
      { href: "/sbu", label: "SBU", icon: Building2, roles: ALL },
      { href: "/giam-sat", label: "Giám sát", icon: ShieldAlert, roles: STAFF },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/tro-ly-ai", label: "Trợ lý AI", icon: Bot, roles: STAFF },
      { href: "/import", label: "Nhập liệu", icon: Upload, roles: STAFF },
      { href: "/nguoi-dung", label: "Người dùng", icon: Users, roles: ["admin"] },
      { href: "/cai-dat", label: "Cài đặt", icon: Settings, roles: ["admin"] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Chấm số điểm nóng ở góc trên bên phải mục menu: đỏ = quá hạn/thiếu, vàng = sắp đến hạn. */
function BadgePill({ badge }: { badge: NavBadge }) {
  return (
    <span
      title={badge.hint}
      className={cn(
        "pointer-events-none absolute right-1.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums text-white shadow-sm ring-2 ring-sidebar",
        badge.tone === "crit" ? "bg-red-600" : "bg-amber-500",
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
      <span className="sr-only"> điểm cần chú ý: {badge.hint}</span>
    </span>
  );
}

/** Lần tải badge gần nhất — dùng chung giữa sidebar desktop và menu mobile để hiện ngay, khỏi nhấp nháy. */
let lastBadges: NavBadges = {};

/**
 * Tải badge điểm nóng SAU khi trang đã hiện (không nằm trong đường render của layout — mỗi lần router.refresh sau khi sửa dữ liệu
 * layout chạy lại, nếu badge nằm trong đó thì thêm cả chục truy vấn DB vào mọi thao tác). Cập nhật khi đổi trang, quay lại tab và mỗi 60 giây.
 */
function useNavBadges(): NavBadges {
  const pathname = usePathname();
  const [badges, setBadges] = React.useState<NavBadges>(lastBadges);
  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/nav-badges", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { badges: NavBadges };
        lastBadges = data.badges;
        if (alive) setBadges(data.badges);
      } catch {
        // mất mạng/DB chậm — giữ số cũ
      }
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [pathname]);
  return badges;
}

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const badges = useNavBadges();

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="space-y-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.label}</div>
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const badge = badges?.[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active ? "bg-brand/10 font-medium text-brand" : "text-foreground/70 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />}
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} />
                  <span className={cn("flex-1 truncate", badge && "pr-5")}>{item.label}</span>
                  {badge && <BadgePill badge={badge} />}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Menu điều hướng cho màn hình nhỏ (sidebar ẩn dưới md). */
export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted md:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 p-0">
        <SheetTitle className="flex h-14 items-center gap-2 border-b px-4">
          <BrandMark />
        </SheetTitle>
        <SidebarNav role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[10px] font-bold tracking-tight text-brand-foreground shadow-sm">
        VMG
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">MKT OS</span>
        <span className="block text-[10px] font-normal text-muted-foreground">Phòng Marketing</span>
      </span>
    </span>
  );
}
