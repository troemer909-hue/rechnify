import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { compare } from "bcryptjs";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js Credentials requires JWT cookies. Each JWT is backed by a revocable
  // Session row that is checked on every read and deleted on sign-out.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials.email;
        const password = credentials.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });
        if (!user || !(await compare(password, user.passwordHash))) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const sessionId = randomUUID();
        const membership = await db.tenantMembership.findFirst({
          where: { userId: user.id },
          orderBy: { invitedAt: "asc" },
          select: { tenantId: true },
        });
        token.userId = user.id;
        token.sessionId = sessionId;
        token.activeTenantId = membership?.tenantId ?? null;
        await db.session.create({
          data: {
            id: sessionId,
            userId: user.id,
            activeTenantId: membership?.tenantId ?? null,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          },
        });
      }

      if (typeof token.sessionId !== "string") return token;

      const storedSession = await db.session.findUnique({
        where: { id: token.sessionId },
        select: { userId: true, activeTenantId: true, expiresAt: true },
      });
      if (!storedSession || storedSession.expiresAt <= new Date()) {
        token.sessionValid = false;
        return token;
      }

      const membership = storedSession.activeTenantId
        ? await db.tenantMembership.findUnique({
            where: {
              userId_tenantId: {
                userId: storedSession.userId,
                tenantId: storedSession.activeTenantId,
              },
            },
            select: { tenantId: true },
          })
        : null;
      if (storedSession.activeTenantId && !membership) {
        await db.session.update({
          where: { id: token.sessionId },
          data: { activeTenantId: null },
        });
      }
      token.userId = storedSession.userId;
      token.activeTenantId = membership?.tenantId ?? null;
      token.sessionValid = true;
      return token;
    },
    async session({ session, token }) {
      session.userId =
        token.sessionValid === false || typeof token.userId !== "string"
          ? ""
          : token.userId;
      session.sessionId =
        token.sessionValid === false || typeof token.sessionId !== "string"
          ? ""
          : token.sessionId;
      session.activeTenantId =
        typeof token.activeTenantId === "string" ? token.activeTenantId : null;
      if (session.user) {
        session.user.id = session.userId;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sessionId === "string") {
        await db.session.deleteMany({ where: { id: message.token.sessionId } });
      }
    },
  },
});
