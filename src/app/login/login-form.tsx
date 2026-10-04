"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithCredentials } from "./actions";

export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const res = await signInWithCredentials(formData);
          if (res?.error) {
            setError(res.error);
            return;
          }
          router.replace(next);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="email">Email hoặc tên đăng nhập</Label>
        <Input id="email" name="email" type="text" required autoComplete="username" autoFocus className="h-10" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10"
        />
      </div>
      {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
