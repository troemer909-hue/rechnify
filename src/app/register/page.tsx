"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Das Konto konnte nicht erstellt werden.");
        return;
      }

      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!login || login.error) {
        const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
        const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
        router.replace(`/login${query}`);
        return;
      }
      const requestedDestination = new URLSearchParams(window.location.search).get("callbackUrl");
      const destination =
        requestedDestination?.startsWith("/") && !requestedDestination.startsWith("//")
          ? requestedDestination
          : "/app";
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Die Registrierung ist gerade nicht möglich. Bitte versuche es erneut.");
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
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Konto erstellen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Erstelle dein Konto, um mit Rechnify loszulegen.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            Name <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              maxLength={120}
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            E-Mail-Adresse
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Passwort
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
            <span className="block font-normal text-muted-foreground">Mindestens 8 Zeichen</span>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Konto wird erstellt …" : "Konto erstellen"}
          </button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          Bereits registriert? <Link className="text-foreground underline" href="/login">Anmelden</Link>
        </p>
      </section>
    </main>
  );
}
