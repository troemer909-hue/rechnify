"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TENANT_ROLES, type TenantRoleName } from "@/lib/tenant-roles";
import { inviteMember } from "@/server/members";

export function InviteMemberForm({ currentRole }: { currentRole: TenantRoleName }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSent(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await inviteMember({
      email: form.get("email"),
      role: form.get("role"),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    formElement.reset();
    router.refresh();
  }

  const availableRoles =
    currentRole === "OWNER" ? TENANT_ROLES : ["EDITOR", "REVIEWER"] as const;

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
      <label className="sr-only" htmlFor="invite-email">E-Mail-Adresse</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        required
        maxLength={254}
        placeholder="name@firma.de"
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
      <label className="sr-only" htmlFor="invite-role">Rolle</label>
      <select id="invite-role" name="role" className="rounded-md border bg-background px-3 py-2 text-sm">
        {availableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Wird gesendet …" : "Einladung senden"}
      </button>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-3">{error}</p>}
      {sent && <p role="status" className="text-sm text-emerald-700 sm:col-span-3">Einladung wurde per E-Mail versendet.</p>}
    </form>
  );
}
