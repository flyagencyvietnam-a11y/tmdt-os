"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { fmtDateTime } from "@/lib/format";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUser,
} from "./actions";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

const ROLES: Role[] = ["ADMIN", "MANAGER", "MARKETING", "EC", "VIEWER"];

export function UsersManager({
  rows,
  currentUserId,
}: {
  rows: UserRow[];
  currentUserId: string;
}) {
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function runFormAction(
    action: (
      fd: FormData,
    ) => Promise<{ error?: string; tempPassword?: string; ok?: boolean } | void>,
  ) {
    return (fd: FormData) => {
      startTransition(async () => {
        const res = await action(fd);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        if (res?.tempPassword) {
          toast.success(`Đã lưu. Mật khẩu tạm: ${res.tempPassword}`, {
            duration: 15000,
          });
        } else {
          toast.success("Đã lưu.");
        }
        setEditing(null);
        setCreating(false);
      });
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          Thêm người dùng
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Họ tên</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Chức danh</th>
              <th className="px-3 py-2">Vai trò</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Đăng nhập gần nhất</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="px-3 py-2 font-medium">{u.fullName}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2 text-muted-foreground">{u.jobTitle}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{u.role}</Badge>
                </td>
                <td className="px-3 py-2">
                  {u.isActive ? (
                    <span className="text-ok">Hoạt động</span>
                  ) : (
                    <span className="text-muted-foreground">Đã tắt</span>
                  )}
                  {u.mustChangePassword && (
                    <Badge variant="outline" className="ml-1">
                      chờ đổi MK
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {fmtDateTime(u.lastLoginAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(u)}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        resetUserPassword(u.id).then((r) =>
                          r?.tempPassword
                            ? toast.success(`Mật khẩu tạm: ${r.tempPassword}`, {
                                duration: 15000,
                              })
                            : toast.error("Không đặt lại được mật khẩu."),
                        )
                      }
                    >
                      Đặt lại MK
                    </Button>
                    {u.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          setUserActive(u.id, !u.isActive).then((r) =>
                            r.error
                              ? toast.error(r.error)
                              : toast.success("Đã cập nhật."),
                          )
                        }
                      >
                        {u.isActive ? "Tắt" : "Bật"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tạo mới */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm người dùng</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" action={runFormAction(createUser)}>
            <Field name="email" label="Email" type="email" required />
            <Field name="fullName" label="Họ tên" required />
            <Field name="jobTitle" label="Chức danh" required />
            <RoleField />
            <Field
              name="aliasNames"
              label="Tên cũ trên sheet (phân tách bằng dấu phẩy)"
              placeholder="Kien, Kiên"
            />
            <Button type="submit" className="w-full" disabled={pending}>
              Tạo (sinh mật khẩu tạm)
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sửa */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa người dùng</DialogTitle>
          </DialogHeader>
          {editing && (
            <form className="space-y-3" action={runFormAction(updateUser)}>
              <input type="hidden" name="id" value={editing.id} />
              <div className="text-sm text-muted-foreground">{editing.email}</div>
              <Field name="fullName" label="Họ tên" defaultValue={editing.fullName} required />
              <Field
                name="jobTitle"
                label="Chức danh"
                defaultValue={editing.jobTitle}
                required
              />
              <RoleField defaultValue={editing.role} />
              <Button type="submit" className="w-full" disabled={pending}>
                Lưu
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  name,
  label,
  ...rest
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...rest} />
    </div>
  );
}

function RoleField({ defaultValue }: { defaultValue?: Role }) {
  const [value, setValue] = React.useState<Role>(defaultValue ?? "EC");
  return (
    <div className="space-y-1">
      <Label>Vai trò</Label>
      <input type="hidden" name="role" value={value} />
      <SimpleSelect
        value={value}
        onValueChange={(v) => v && setValue(v as Role)}
        options={ROLES.map((r) => ({ value: r, label: `${r} — ${ROLE_LABELS[r]}` }))}
      />
    </div>
  );
}
