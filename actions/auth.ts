"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { isDemoAccount, isDemoLoginAllowed } from "@/lib/live";

const credentialsSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(8),
});

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: "Email o password non validi." };
  }
  if (isDemoAccount(parsed.data.email) && !isDemoLoginAllowed()) {
    return { error: "I conti dimostrativi sono spenti in modalità live." };
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: String(formData.get("callbackUrl") || "/portafoglio"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Accesso negato. Controlla email e password." };
    }
    throw error;
  }
  return { error: "Accesso negato." };
}

export async function registerAction(_prev: { error?: string } | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  if (name.length < 2) return { error: "Il nome è troppo corto." };
  if (!email.includes("@")) return { error: "Indica un’email valida." };
  if (password.length < 8) return { error: "La password deve avere almeno 8 caratteri." };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Questa email è già iscritta alla zecca." };

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hash(password, 12),
      role: "CUSTOMER",
    },
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/vetrina",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/accedi");
    }
    throw error;
  }
  return { error: undefined };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
