"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "./actions";

export function ChangePasswordForm() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  return (
    <form
      className="space-y-3"
      action={(fd) => {
        setMsg(null);
        start(async () => {
          const res = await changePassword(fd);
          if (res?.error) {
            setMsg(res.error);
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="current">Mật khẩu hiện tại</Label>
        <Input id="current" name="current" type="password" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="next">Mật khẩu mới (tối thiểu 8 ký tự)</Label>
        <Input id="next" name="next" type="password" minLength={8} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm">Nhập lại mật khẩu mới</Label>
        <Input id="confirm" name="confirm" type="password" minLength={8} required />
      </div>
      {msg && <p className="text-sm text-crit">{msg}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}
