"use server";

import { randomUUID } from "node:crypto";
import { TenantRole } from "@prisma/client";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@/lib/db";
import { signInviteToken, verifyInviteToken } from "@/lib/invite-token";
import { requireRole } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

const inviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  role: z.nativeEnum(TenantRole),
});
const roleSchema = z.nativeEnum(TenantRole);
const membershipIdSchema = z.string().min(1).max(191);

function refreshMembers() {
  revalidatePath("/app/settings/members");
  revalidatePath("/app");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function inviteMember(input: unknown): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bitte gib eine gültige E-Mail und Rolle an." };

  const context = await requireRole(TenantRole.ADMIN);
  if (
    context.membership.role === TenantRole.ADMIN &&
    (parsed.data.role === TenantRole.OWNER || parsed.data.role === TenantRole.ADMIN)
  ) {
    return { ok: false, error: "Admins können keine Owner oder weiteren Admins einladen." };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false, error: "Der E-Mail-Versand ist nicht konfiguriert." };

  const existing = await db.tenantMembership.findFirst({
    where: {
      tenantId: context.tenantId,
      OR: [
        { email: parsed.data.email },
        { user: { is: { email: parsed.data.email } } },
      ],
    },
    select: { id: true, userId: true },
  });
  if (existing?.userId) {
    return { ok: false, error: "Diese Person ist bereits Mitglied des Mandanten." };
  }

  const tenant = await db.tenant.findUnique({
    where: { id: context.tenantId },
    select: { name: true },
  });
  if (!tenant) return { ok: false, error: "Der aktive Mandant wurde nicht gefunden." };

  let signedInvite: ReturnType<typeof signInviteToken>;
  try {
    signedInvite = signInviteToken({
      tenantId: context.tenantId,
      email: parsed.data.email,
      role: parsed.data.role,
      jti: randomUUID(),
    });
  } catch (error) {
    console.error("Invite token signing failed", error);
    return { ok: false, error: "Einladung kann gerade nicht erstellt werden." };
  }

  const expiresAt = new Date(signedInvite.claims.exp * 1000);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let inviteUrl: URL;
  try {
    inviteUrl = new URL("/invite/accept", baseUrl);
    inviteUrl.searchParams.set("token", signedInvite.token);
  } catch {
    return { ok: false, error: "Die App-Adresse für Einladungen ist ungültig." };
  }

  const membershipWhere = existing
    ? { id: existing.id }
    : { tenantId_email: { tenantId: context.tenantId, email: parsed.data.email } };
  await db.tenantMembership.upsert({
    where: membershipWhere,
    create: {
      tenantId: context.tenantId,
      email: parsed.data.email,
      role: parsed.data.role,
      inviteTokenId: signedInvite.claims.jti,
      inviteExpiresAt: expiresAt,
    },
    update: {
      role: parsed.data.role,
      inviteTokenId: signedInvite.claims.jti,
      inviteExpiresAt: expiresAt,
      invitedAt: new Date(),
    },
  });

  const resend = new Resend(resendApiKey);
  let deliveryError: unknown;
  try {
    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      to: [parsed.data.email],
      subject: `Einladung zu ${tenant.name} auf Rechnify`,
      html: `<p>Du wurdest eingeladen, dem Mandanten <strong>${escapeHtml(tenant.name)}</strong> auf Rechnify beizutreten.</p><p><a href="${escapeHtml(inviteUrl.toString())}">Einladung annehmen</a></p><p>Der Link ist sieben Tage gültig.</p>`,
    });
    deliveryError = response.error;
  } catch (error) {
    deliveryError = error;
  }

  if (deliveryError) {
    await db.tenantMembership.deleteMany({
      where: { tenantId: context.tenantId, email: parsed.data.email, inviteTokenId: signedInvite.claims.jti },
    });
    console.error("Invite email delivery failed", deliveryError);
    return { ok: false, error: "Die Einladungs-E-Mail konnte nicht versendet werden." };
  }

  refreshMembers();
  return { ok: true };
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.userId || !session.sessionId) {
    return { ok: false, error: "Bitte melde dich an, um die Einladung anzunehmen." };
  }

  const claims = verifyInviteToken(token);
  if (!claims) {
    return { ok: false, error: "Die Einladung ist ungültig oder abgelaufen." };
  }
  if (session.user?.email?.toLowerCase() !== claims.email) {
    return { ok: false, error: `Melde dich mit ${claims.email} an, um diese Einladung anzunehmen.` };
  }

  const invite = await db.tenantMembership.findFirst({
    where: {
      tenantId: claims.tenantId,
      email: claims.email,
      role: claims.role,
      userId: null,
      inviteTokenId: claims.jti,
      inviteExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!invite) return { ok: false, error: "Die Einladung ist ungültig oder abgelaufen." };

  try {
    await db.$transaction(async (tx) => {
      const existingMembership = await tx.tenantMembership.findUnique({
        where: {
          userId_tenantId: { userId: session.userId, tenantId: claims.tenantId },
        },
        select: { id: true },
      });
      if (existingMembership) throw new Error("Du bist bereits Mitglied dieses Mandanten.");

      const accepted = await tx.tenantMembership.updateMany({
        where: { id: invite.id, tenantId: claims.tenantId, userId: null, inviteTokenId: claims.jti },
        data: {
          userId: session.userId,
          email: null,
          inviteTokenId: null,
          inviteExpiresAt: null,
        },
      });
      if (accepted.count !== 1) throw new Error("Die Einladung wurde bereits verwendet.");

      const activeSession = await tx.session.updateMany({
        where: { id: session.sessionId, userId: session.userId },
        data: { activeTenantId: claims.tenantId },
      });
      if (activeSession.count !== 1) throw new Error("Die Sitzung ist abgelaufen.");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const userErrors = [
      "Du bist bereits Mitglied dieses Mandanten.",
      "Die Einladung wurde bereits verwendet.",
      "Die Sitzung ist abgelaufen.",
    ];
    if (userErrors.includes(message)) return { ok: false, error: message };
    console.error("Invite acceptance failed", error);
    return { ok: false, error: "Die Einladung konnte nicht angenommen werden." };
  }

  refreshMembers();
  return { ok: true };
}

export async function changeRole(membershipId: string, role: TenantRole): Promise<ActionResult> {
  const context = await requireRole(TenantRole.OWNER);
  const parsedId = membershipIdSchema.safeParse(membershipId);
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedId.success || !parsedRole.success) {
    return { ok: false, error: "Mitglied oder Rolle ist ungültig." };
  }

  const target = await db.tenantMembership.findFirst({
    where: { id: parsedId.data, tenantId: context.tenantId },
    select: { id: true, role: true, userId: true },
  });
  if (!target) return { ok: false, error: "Mitglied wurde nicht gefunden." };
  if (!target.userId) {
    return { ok: false, error: "Ändere die Rolle einer Einladung durch erneutes Einladen der Person." };
  }

  if (target.role === TenantRole.OWNER && parsedRole.data !== TenantRole.OWNER) {
    const otherOwners = await db.tenantMembership.count({
      where: { tenantId: context.tenantId, role: TenantRole.OWNER, id: { not: target.id } },
    });
    if (otherOwners === 0) return { ok: false, error: "Ein Mandant muss mindestens einen Owner haben." };
  }

  await db.tenantMembership.update({
    where: { id: target.id },
    data: { role: parsedRole.data },
  });
  refreshMembers();
  return { ok: true };
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  const context = await requireRole(TenantRole.ADMIN);
  const parsedId = membershipIdSchema.safeParse(membershipId);
  if (!parsedId.success) return { ok: false, error: "Mitglied ist ungültig." };

  const target = await db.tenantMembership.findFirst({
    where: { id: parsedId.data, tenantId: context.tenantId },
    select: { id: true, role: true, userId: true },
  });
  if (!target) return { ok: false, error: "Mitglied wurde nicht gefunden." };
  if (target.userId === context.session.userId) {
    return { ok: false, error: "Du kannst dich nicht selbst aus dem Mandanten entfernen." };
  }

  if (target.role === TenantRole.OWNER) {
    const otherOwners = await db.tenantMembership.count({
      where: { tenantId: context.tenantId, role: TenantRole.OWNER, id: { not: target.id } },
    });
    if (otherOwners === 0) return { ok: false, error: "Ein Mandant muss mindestens einen Owner haben." };
  }

  await db.tenantMembership.delete({ where: { id: target.id } });
  refreshMembers();
  return { ok: true };
}
