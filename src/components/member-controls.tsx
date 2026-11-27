"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TENANT_ROLES, type TenantRoleName } from "@/lib/tenant-roles";
import { changeRole, removeMember } from "@/server/members";

export function MemberControls({
  membershipId,
  role,
  currentRole,
  pendingInvite,
}: {
  membershipId: string;
  role: TenantRoleName;
  currentRole: TenantRoleName;
  pendingInvite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onRoleChange(nextRole: TenantRoleName) {
    setPending(true);
    setError("");
    const result = await changeRole(membershipId, nextRole);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function onRemove() {
    if (!window.confirm("Mitglied aus diesem Mandanten entfernen?")) return;
    setPending(true);
    setError("");
    const result = await removeMember(membershipId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentRole === "OWNER" && !pendingInvite && (
        <select
          aria-label="Mitgliedsrolle ändern"
          value={role}
          disabled={pending}
          onChange={(event) => void onRoleChange(event.target.value as TenantRoleName)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
        >
          {TENANT_ROLES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => void onRemove()}
        className="rounded-md border px-2 py-1.5 text-sm text-destructive disabled:opacity-60"
      >
        Entfernen
      </button>
      {error && <p role="alert" className="basis-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
