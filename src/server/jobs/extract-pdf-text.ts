import type PgBoss from "pg-boss";
import pdf from "pdf-parse";
import { db } from "@/lib/db";
import { downloadBuffer } from "@/lib/s3";

type PdfTextJob = {
  invoiceId: string;
  tenantId: string;
  originalFileKey: string;
};

function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function markFailed(job: PdfTextJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown PDF extraction error";
  const invoice = await db.invoice.findFirst({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    select: { extractedData: true },
  });
  if (!invoice) return;
  await db.invoice.updateMany({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    data: {
      status: "FAILED",
      extractedData: { ...objectData(invoice.extractedData), error: message },
    },
  });
}

async function processJob(boss: PgBoss, job: PdfTextJob) {
  await db.invoice.updateMany({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    data: { status: "EXTRACTING" },
  });

  try {
    const invoice = await db.invoice.findFirst({
      where: { id: job.invoiceId, tenantId: job.tenantId },
      select: { extractedData: true },
    });
    if (!invoice) throw new Error("Invoice not found for PDF extraction");

    const buffer = await downloadBuffer(job.originalFileKey);
    if (buffer.length === 0) throw new Error("Uploaded PDF is empty");
    const parsed = await pdf(buffer);
    const rawText = parsed.text.trim();
    if (rawText.replace(/\s/g, "").length < 100) {
      const queued = await boss.send("extract-ocr", {
        invoiceId: job.invoiceId,
        tenantId: job.tenantId,
        originalFileKey: job.originalFileKey,
      });
      if (!queued) throw new Error("Could not enqueue OCR extraction");
      return;
    }

    await db.invoice.updateMany({
      where: { id: job.invoiceId, tenantId: job.tenantId },
      data: {
        extractedData: {
          ...objectData(invoice.extractedData),
          rawText,
          pageCount: parsed.numpages,
        },
      },
    });
    const queued = await boss.send("extract-fields", {
      invoiceId: job.invoiceId,
      tenantId: job.tenantId,
    });
    if (!queued) throw new Error("Could not enqueue field extraction");
  } catch (error) {
    await markFailed(job, error);
  }
}

export async function registerPdfTextExtractionWorker(boss: PgBoss) {
  await boss.work<PdfTextJob>("extract-pdf-text", { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await processJob(boss, job.data);
  });
}
