"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const tenantInputSchema = z.object({
  name: z.string().trim().min(1, "Bitte gib einen Firmennamen ein.").max(120),
  legalName: z.string().trim().min(1, "Bitte gib den Rechtsnamen ein.").max(200),
  street: z.string().trim().min(1, "Bitte gib die Anschrift ein.").max(200),
  zip: z.string().trim().min(1, "Bitte gib die Postleitzahl ein.").max(20),
  city: z.string().trim().min(1, "Bitte gib den Ort ein.").max(120),
  country: z.string().trim().length(2).default("DE"),
  taxId: z.string().trim().max(100).optional(),
  vatId: z.string().trim().max(100).optional(),
});

const tenantIdSchema = z.string().min(1).max(191);

type TenantActionResult =
  | { ok: true; tenantId?: string }
  | { ok: false; error: string };

async function currentSession() {
  const session = await getSession();
  if (!session?.userId || !session.sessionId) return null;
  return session;
}

export async function createTenant(input: unknown): Promise<TenantActionResult> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Bitte melde dich erneut an." };

  const parsed = tenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }

  try {
    const tenant = await db.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          ...parsed.data,
          country: parsed.data.country.toUpperCase(),
          taxId: parsed.data.taxId || null,
          vatId: parsed.data.vatId || null,
          memberships: {
            create: { userId: session.userId, role: "OWNER" },
          },
        },
        select: { id: true },
      });

      const activatedSession = await tx.session.updateMany({
        where: { id: session.sessionId, userId: session.userId },
        data: { activeTenantId: created.id },
      });
      if (activatedSession.count !== 1) {
        throw new Error("Session expired while creating tenant");
      }
      return created;
    });

    revalidatePath("/app");
    revalidatePath("/app/settings/tenant");
    return { ok: true, tenantId: tenant.id };
  } catch (error) {
    console.error("Tenant creation failed", error);
    return { ok: false, error: "Der Mandant konnte nicht erstellt werden." };
  }
}

export async function updateTenant(input: unknown): Promise<TenantActionResult> {
  const session = await currentSession();
  if (!session?.activeTenantId) {
    return { ok: false, error: "Wähle zuerst einen Mandanten aus." };
  }

  const parsed = tenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." };
  }

  const membership = await db.tenantMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: session.userId,
        tenantId: session.activeTenantId,
      },
    },
    select: { role: true },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return { ok: false, error: "Du darfst die Stammdaten dieses Mandanten nicht ändern." };
  }

  try {
    await db.tenant.update({
      where: { id: session.activeTenantId },
      data: {
        ...parsed.data,
        country: parsed.data.country.toUpperCase(),
        taxId: parsed.data.taxId || null,
        vatId: parsed.data.vatId || null,
      },
    });
    revalidatePath("/app");
    revalidatePath("/app/settings/tenant");
    return { ok: true, tenantId: session.activeTenantId };
  } catch (error) {
    console.error("Tenant update failed", error);
    return { ok: false, error: "Die Stammdaten konnten nicht gespeichert werden." };
  }
}

export async function switchTenant(tenantId: unknown): Promise<TenantActionResult> {
  const session = await currentSession();
  if (!session) return { ok: false, error: "Bitte melde dich erneut an." };

  const parsedId = tenantIdSchema.safeParse(tenantId);
  if (!parsedId.success) {
    return { ok: false, error: "Der ausgewählte Mandant ist ungültig." };
  }

  const membership = await db.tenantMembership.findUnique({
    where: {
      userId_tenantId: {
        userId: session.userId,
        tenantId: parsedId.data,
      },
    },
    select: { tenantId: true },
  });
  if (!membership) {
    return { ok: false, error: "Du bist nicht Mitglied dieses Mandanten." };
  }

  const result = await db.session.updateMany({
    where: { id: session.sessionId, userId: session.userId },
    data: { activeTenantId: membership.tenantId },
  });
  if (result.count !== 1) {
    return { ok: false, error: "Die Sitzung ist abgelaufen. Bitte melde dich erneut an." };
  }

  revalidatePath("/app");
  revalidatePath("/app/settings/tenant");
  return { ok: true, tenantId: membership.tenantId };
}
