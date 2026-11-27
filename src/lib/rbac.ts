import { TenantRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export class UnauthorizedError extends Error {
  constructor(message = "Du hast keine Berechtigung für diese Aktion.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

const roleRank: Record<TenantRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  REVIEWER: 1,
};

export async function requireRole(minRole: TenantRole) {
  const session = await getSession();
  if (!session?.userId || !session.activeTenantId) {
    throw new UnauthorizedError("Bitte wähle einen Mandanten aus.");
  }

  const membership = await db.tenantMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: session.userId,
        tenantId: session.activeTenantId,
      },
    },
    select: { id: true, role: true },
  });
  if (!membership || roleRank[membership.role] < roleRank[minRole]) {
    throw new UnauthorizedError();
  }

  return {
    session,
    tenantId: session.activeTenantId,
    membership,
  };
}
