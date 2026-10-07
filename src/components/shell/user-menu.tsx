"use client";

import { KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(app)/actions";
import { PushToggle } from "./push-toggle";

export function UserMenu({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-2 px-1.5" />}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
          {initials(fullName)}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{fullName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Base UI: nhãn menu bắt buộc nằm trong Group — thiếu thì mở menu là sập trang. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/doi-mat-khau" />}>
          <KeyRound className="mr-2 h-4 w-4" /> Đổi mật khẩu
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />} {dark ? "Giao diện sáng" : "Giao diện tối"}
        </DropdownMenuItem>
        <div onClick={(e) => e.preventDefault()}>
          <PushToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOutAction()}>
          <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
