import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { notFound, redirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { InvoiceReviewForm } from "@/components/pruefmaske/invoice-review-form";
import { PdfPreview } from "@/components/pruefmaske/pdf-preview";
import { db } from "@/lib/db";
import { invoiceFormSchema } from "@/lib/invoice-form-schema";
import { getSession } from "@/lib/session";
import { S3_BUCKET, s3 } from "@/lib/s3";
import type { InvoiceData, SenderMatch } from "@/lib/types/invoice";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const session = await getSession();
  if (!session?.activeTenantId) redirect("/app/settings/tenant");

  const { invoiceId } = await params;
  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      tenantId: session.activeTenantId,
      deletedAt: null,
      status: "REVIEW",
      tenant: { memberships: { some: { userId: session.userId } } },
    },
    select: { id: true, originalFileKey: true, originalFileType: true, extractedData: true },
  });
  if (!invoice) notFound();

  const extracted = asObject(invoice.extractedData);
  const parsedFields = invoiceFormSchema.safeParse(extracted.fields);
  if (!parsedFields.success) notFound();
  const fields = parsedFields.data as InvoiceData;
  const matchValue = asObject(extracted.senderMatch);
  const senderMatch =
    (matchValue.overall === "ok" || matchValue.overall === "warning" || matchValue.overall === "mismatch")
      ? matchValue as unknown as SenderMatch
      : null;
  const ocrConfidence = typeof extracted.ocrConfidence === "number" ? extracted.ocrConfidence : null;
  const isPdf = invoice.originalFileType.toLowerCase() === "pdf";
  const signedUrl = isPdf
    ? await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: invoice.originalFileKey }),
        { expiresIn: 60 * 60 },
      )
    : null;
  const previewHtml = typeof extracted.previewHtml === "string"
    ? sanitizeHtml(extracted.previewHtml)
    : "";

  const preview = isPdf && signedUrl ? (
    <PdfPreview url={signedUrl} />
  ) : previewHtml ? (
    <>
      <p className="border-b bg-blue-50 px-5 py-3 text-sm text-blue-950">Vorschau aus Quelldokument</p>
      <div className="prose prose-sm max-w-none p-6" dangerouslySetInnerHTML={{ __html: previewHtml }} />
    </>
  ) : (
    <div className="p-6 text-sm text-muted-foreground">Für dieses Quelldokument ist keine Vorschau verfügbar.</div>
  );

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:h-[calc(100vh-1rem)] lg:overflow-hidden lg:px-0 lg:py-2">
      <header className="mb-4 flex items-center justify-between gap-4 px-1 lg:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rechnungsprüfung</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rechnung prüfen und bearbeiten</h1>
        </div>
        <a href="/app" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Zur Übersicht</a>
      </header>

      <details className="mb-4 overflow-hidden rounded-xl border bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
          <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
            {isPdf && signedUrl ? <PdfPreview url={signedUrl} thumbnail /> : <span className="text-[10px] text-muted-foreground">DOCX</span>}
          </span>
          <span>
            <span className="block text-sm font-semibold">Quelldokument</span>
            <span className="block text-xs text-muted-foreground">Tippen, um die Vorschau zu öffnen</span>
          </span>
        </summary>
        <div className="max-h-[65vh] overflow-auto border-t">{preview}</div>
      </details>

      <div className="grid gap-4 lg:h-[calc(100%-5.5rem)] lg:grid-cols-2 lg:gap-0">
        <section aria-label="Quelldokument" className="hidden overflow-y-auto border-r bg-muted/20 lg:block">
          <div className="sticky top-0 z-10 border-b bg-background/95 px-5 py-3 text-sm font-semibold backdrop-blur">Quelldokument</div>
          {preview}
        </section>
        <section aria-label="Rechnungsdaten" className="min-w-0 overflow-y-auto lg:px-5 lg:py-3">
          <InvoiceReviewForm
            invoiceId={invoice.id}
            initialData={fields}
            senderMatch={senderMatch}
            ocrConfidence={ocrConfidence}
          />
        </section>
      </div>
    </main>
  );
}
