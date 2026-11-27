import Link from "next/link";
import { getSession } from "@/lib/session";
import { AcceptInvite } from "@/components/accept-invite";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const session = await getSession();
  const callbackUrl = token
    ? `/invite/accept?token=${encodeURIComponent(token)}`
    : "/invite/accept";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full rounded-xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-semibold text-muted-foreground">Rechnify</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Mandanteneinladung</h1>
        {!token ? (
          <p className="mt-3 text-sm text-destructive">Der Einladungslink enthält keinen gültigen Token.</p>
        ) : session ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Nimm die Einladung mit dem angemeldeten Konto {session.user?.email} an.
            </p>
            <AcceptInvite token={token} />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Melde dich mit der eingeladenen E-Mail-Adresse an oder erstelle dafür ein Konto.
            </p>
            <div className="mt-6 grid gap-3">
              <Link
                className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Anmelden
              </Link>
              <Link
                className="rounded-md border px-4 py-2 text-center text-sm font-medium"
                href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Konto erstellen
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
