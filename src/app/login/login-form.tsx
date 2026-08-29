"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithCredentials } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = await signInWithCredentials(formData);
          if (res?.error) {
            setError(res.error);
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="email">Email hoặc tên đăng nhập</Label>
        <Input id="email" name="email" type="text" required autoComplete="username" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-crit">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
