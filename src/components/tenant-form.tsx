"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { createTenant, updateTenant } from "@/server/tenants";

export type TenantFormValues = {
  name: string;
  legalName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  taxId: string | null;
  vatId: string | null;
};

type Props = { tenant?: TenantFormValues };

const fields: Array<{ name: keyof TenantFormValues; label: string; required?: boolean }> = [
  { name: "name", label: "Firmenname", required: true },
  { name: "legalName", label: "Rechtsname", required: true },
  { name: "street", label: "Anschrift", required: true },
  { name: "zip", label: "Postleitzahl", required: true },
  { name: "city", label: "Ort", required: true },
  { name: "country", label: "Land (ISO-Code)", required: true },
  { name: "taxId", label: "Steuernummer" },
  { name: "vatId", label: "USt-ID" },
];

export function TenantForm({ tenant }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      fields.map(({ name }) => [name, String(form.get(name) ?? "").trim()]),
    );
    const result = tenant ? await updateTenant(input) : await createTenant(input);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (tenant) {
      setSaved(true);
      router.refresh();
    } else {
      router.replace("/app");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map(({ name, label, required }) => (
          <label key={name} className="block space-y-2 text-sm font-medium">
            {label}
            <input
              name={name}
              required={required}
              maxLength={name === "legalName" || name === "street" ? 200 : 120}
              defaultValue={tenant?.[name] ?? (name === "country" ? "DE" : "")}
              autoComplete={name === "street" ? "street-address" : name === "city" ? "address-level2" : undefined}
              className="w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">Stammdaten gespeichert.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Wird gespeichert …" : tenant ? "Änderungen speichern" : "Mandant erstellen"}
      </button>
    </form>
  );
}
