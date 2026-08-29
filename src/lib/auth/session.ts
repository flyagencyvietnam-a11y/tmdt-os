import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { Role } from "./permissions";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: session.user.fullName,
    role: session.user.role,
    mustChangePassword: session.user.mustChangePassword,
  };
}

/** Dùng trong server component / route handler. Redirect nếu chưa đăng nhập. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/doi-mat-khau");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/khong-co-quyen");
  return user;
}
