"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/auth";

export async function signInWithCredentials(
  formData: FormData,
): Promise<{ error?: string } | void> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa." };
    }
    throw e;
  }
}
