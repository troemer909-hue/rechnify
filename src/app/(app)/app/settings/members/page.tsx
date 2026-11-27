import { redirect } from "next/navigation";
import { TenantRole } from "@prisma/client";
import { InviteMemberForm } from "@/components/invite-member-form";
import { MemberControls } from "@/components/member-controls";
import { UnauthorizedError, requireRole } from "@/lib/rbac";
import { db } from "@/lib/db";

export default async function MembersSettingsPage() {
  let context;
  try {
    context = await requireRole(TenantRole.ADMIN);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/app");
    throw error;
  }

  const members = await db.tenantMembership.findMany({
    where: { tenantId: context.tenantId },
    orderBy: [{ invitedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      email: true,
      role: true,
      invitedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Mitglieder</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Lade Personen ein und verwalte den Zugriff auf den aktuellen Mandanten.
      </p>
      <section className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-medium">Person einladen</h2>
        <InviteMemberForm currentRole={context.membership.role} />
      </section>
      <section className="mt-8 overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b px-6 py-4 font-medium">Mitglieder und Einladungen</h2>
        <ul className="divide-y">
          {members.map((member) => {
            const pendingInvite = member.userId === null;
            const label = member.user?.name || member.user?.email || member.email || "Unbekannt";
            return (
              <li key={member.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pendingInvite ? `Ausstehend · ${member.email}` : member.user?.email}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-muted-foreground">{member.role}</span>
                  <MemberControls
                    membershipId={member.id}
                    role={member.role}
                    currentRole={context.membership.role}
                    pendingInvite={pendingInvite}
                  />
                </div>
              </li>
            );
          })}
          {members.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-muted-foreground">Noch keine Mitglieder vorhanden.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
