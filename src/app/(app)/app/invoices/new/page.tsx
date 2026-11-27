import { redirect } from "next/navigation";
import { TenantRole } from "@prisma/client";
import { InvoiceUploadForm } from "@/components/invoice-upload-form";
import { UnauthorizedError, requireRole } from "@/lib/rbac";

export default async function NewInvoicePage() {
  let context;
  try {
    context = await requireRole(TenantRole.EDITOR);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/app");
    throw error;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Rechnung hochladen</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Lade eine PDF- oder DOCX-Rechnung für den aktiven Mandanten hoch.
      </p>
      <section className="mt-8 rounded-xl border bg-card p-6">
        <InvoiceUploadForm tenantId={context.tenantId} />
      </section>
    </main>
  );
}
