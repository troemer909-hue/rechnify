"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: form.get("email"),
        password: form.get("password"),
        redirect: false,
      });
      if (!result || result.error) {
        setError("E-Mail-Adresse oder Passwort ist nicht korrekt.");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      setError("Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <section className="w-full rounded-xl border bg-card p-8 shadow-sm">
        <Link href="/" className="text-sm font-semibold text-muted-foreground">
          Rechnify
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Anmelden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            E-Mail-Adresse
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Passwort
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Wird angemeldet …" : "Anmelden"}
          </button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Noch kein Konto? <Link className="text-foreground underline" href="/register">Konto erstellen</Link>
        </p>
      </section>
    </main>
  );
}
