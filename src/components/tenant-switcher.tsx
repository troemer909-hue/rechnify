"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { switchTenant } from "@/server/tenants";

type TenantOption = { tenantId: string; name: string };

export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: TenantOption[];
  activeTenantId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (tenants.length < 2) return null;

  async function changeTenant(tenantId: string) {
    setPending(true);
    setError("");
    const result = await switchTenant(tenantId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-2">
      <label htmlFor="tenant-switcher" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Mandant
      </label>
      <select
        id="tenant-switcher"
        value={activeTenantId ?? ""}
        disabled={pending}
        onChange={(event) => void changeTenant(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
      >
        {!activeTenantId && <option value="">Mandant auswählen</option>}
        {tenants.map((tenant) => (
          <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.name}</option>
        ))}
      </select>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
