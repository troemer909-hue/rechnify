import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { notFound, redirect } from "next/navigation";
import { GenerationStatus } from "@/components/pruefmaske/generation-status";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { S3_BUCKET, s3 } from "@/lib/s3";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function InvoiceResultPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const session = await getSession();
  if (!session?.activeTenantId) redirect("/login");
  const { invoiceId } = await params;
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      tenantId: session.activeTenantId,
      tenant: { memberships: { some: { userId: session.userId } } },
    },
    select: {
      status: true,
      zugferdFileKey: true,
      reportFileKey: true,
      extractedData: true,
      validationResult: true,
    },
  });
  if (!invoice) notFound();

  const data = asObject(invoice.extractedData);
  const validation = asObject(invoice.validationResult);
  const validationErrors = Array.isArray(validation.errors) ? validation.errors : [];
  const pdfUrl = invoice.zugferdFileKey
    ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: invoice.zugferdFileKey }), { expiresIn: 3600 })
    : null;
  const reportUrl = invoice.reportFileKey
    ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: invoice.reportFileKey }), { expiresIn: 3600 })
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm font-semibold text-muted-foreground">Rechnify · Ergebnis</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {invoice.status === "DONE" ? "E-Rechnung ist bereit" : invoice.status === "FAILED" ? "Erstellung fehlgeschlagen" : "Wird erstellt…"}
      </h1>
      {invoice.status === "GENERATING" && <GenerationStatus invoiceId={invoiceId} status={invoice.status} />}
      {invoice.status === "FAILED" && (
        <section role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-5 text-sm text-red-950">
          <p className="font-semibold">Die Datei konnte nicht erfolgreich erstellt oder validiert werden.</p>
          {typeof data.error === "string" && <p className="mt-2">{data.error}</p>}
          {validationErrors.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-1">
              {validationErrors.map((value, index) => {
                const error = asObject(value);
                return <li key={index}>{String(error.id ?? "MUSTANG")}: {String(error.message ?? "Validierungsfehler")}</li>;
              })}
            </ul>
          )}
        </section>
      )}
      {invoice.status === "DONE" && (
        <section className="mt-6 space-y-3 rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">Die Validierung wurde erfolgreich abgeschlossen.</p>
          {pdfUrl && <a href={pdfUrl} download className="block rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">ZUGFeRD-Rechnung herunterladen</a>}
          {reportUrl && <a href={reportUrl} download className="block rounded-md border px-4 py-3 text-center text-sm font-semibold hover:bg-muted">Prüfbericht herunterladen</a>}
        </section>
      )}
      <a href="/app" className="mt-8 inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Zur Übersicht</a>
    </main>
  );
}
