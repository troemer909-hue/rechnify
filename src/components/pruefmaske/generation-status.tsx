"use client";

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function GenerationStatus({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status === "DONE" || status === "FAILED") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { status?: string };
        if (result.status === "DONE" || result.status === "FAILED") {
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {
        // The next interval retries transient status request failures.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [invoiceId, router, status]);

  return (
    <div role="status" aria-live="polite" className="mt-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <LoaderCircle className="animate-spin text-primary" size={20} aria-hidden="true" />
      <span>{status === "GENERATING" ? "Die ZUGFeRD-Datei wird erstellt und geprüft …" : "Der aktuelle Rechnungsstatus wird geladen …"}</span>
    </div>
  );
}
