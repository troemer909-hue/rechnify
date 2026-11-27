import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TenantForm } from "@/components/tenant-form";

export default async function TenantSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant = session.activeTenantId
    ? await db.tenant.findFirst({
        where: {
          id: session.activeTenantId,
          memberships: { some: { userId: session.userId } },
        },
        select: {
          name: true,
          legalName: true,
          street: true,
          zip: true,
          city: true,
          country: true,
          taxId: true,
          vatId: true,
        },
      })
    : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {tenant ? "Mandanten-Stammdaten" : "Mandant einrichten"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {tenant
          ? "Bearbeite die Unternehmensangaben des aktuell ausgewählten Mandanten."
          : "Lege deinen ersten Mandanten an, um Rechnify zu verwenden."}
      </p>
      <section className="mt-8 rounded-xl border bg-card p-6">
        <TenantForm tenant={tenant ?? undefined} />
      </section>
    </main>
  );
}
