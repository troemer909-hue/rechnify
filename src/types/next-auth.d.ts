import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
  }

  interface Session extends DefaultSession {
    userId: string;
    activeTenantId: string | null;
    user: NonNullable<DefaultSession["user"]> & { id: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    sessionId?: string;
    activeTenantId?: string | null;
    sessionValid?: boolean;
  }
}
