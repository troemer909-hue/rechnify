import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TenantSwitcher } from "@/components/tenant-switcher";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await db.tenantMembership.findMany({
    where: { userId: session.userId },
    orderBy: { invitedAt: "asc" },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b bg-card px-5 py-6 md:min-h-screen md:border-b-0 md:border-r">
        <Link href="/app" className="font-semibold">Rechnify</Link>
        <TenantSwitcher
          tenants={memberships.map(({ tenantId, tenant }) => ({ tenantId, name: tenant.name }))}
          activeTenantId={session.activeTenantId}
        />
        <nav className="mt-8 grid gap-2 text-sm">
          <Link href="/app" className="rounded-md px-3 py-2 hover:bg-muted">Übersicht</Link>
          <Link href="/app/settings/tenant" className="rounded-md px-3 py-2 hover:bg-muted">Mandant & Stammdaten</Link>
          <Link href="/app/settings/members" className="rounded-md px-3 py-2 hover:bg-muted">Mitglieder</Link>
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}
