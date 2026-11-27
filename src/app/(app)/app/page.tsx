import { signOut } from "@/lib/auth";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Rechnify</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Willkommen{session.user?.name ? `, ${session.user.name}` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">{session.user?.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            Abmelden
          </button>
        </form>
      </header>
      <section className="mt-10 rounded-xl border bg-card p-6">
        <h2 className="font-medium">Arbeitsbereich</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {session.activeTenantId
            ? `Aktiver Mandant: ${session.activeTenantId}`
            : "Dein Konto ist bereit. Ein Mandant kann später eingerichtet werden."}
        </p>
      </section>
    </main>
  );
}
