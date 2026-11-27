"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptInvite } from "@/server/members";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError("");
    const result = await acceptInvite(token);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={() => void accept()}
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Einladung wird angenommen …" : "Einladung annehmen"}
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
