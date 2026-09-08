import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import "@/lib/boot-env";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import { isDemoAccount, isDemoLoginAllowed } from "@/lib/live";
import { ensureHouseAdmin, findUserByLoginEmail, houseDisplayName, isHouseEmail } from "@/lib/zecca/house";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }
}

declare module "next-auth" {
  interface User {
    role: Role;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: {
    signIn: "/accedi",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        if (isDemoAccount(email) && !isDemoLoginAllowed()) return null;
        const user = await findUserByLoginEmail(email);
        if (!user) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        if (isHouseEmail(user.email)) {
          await ensureHouseAdmin({ userId: user.id, email: user.email });
        }
        return {
          id: user.id,
          email: user.email,
          name: houseDisplayName(user.email) ?? user.name,
          role: isHouseEmail(user.email) ? "ADMIN" : user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      if (isHouseEmail(String(token.email ?? ""))) {
        token.role = "ADMIN";
        token.name = houseDisplayName(String(token.email)) ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.email = String(token.email ?? session.user.email);
        session.user.name = String(token.name ?? session.user.name);
        session.user.role = (token.role as Role) ?? "CUSTOMER";
      }
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!row) return session.user;
  return {
    id: row.id,
    email: row.email,
    name: houseDisplayName(row.email) ?? row.name,
    role: isHouseEmail(row.email) ? "ADMIN" : row.role,
  };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}
