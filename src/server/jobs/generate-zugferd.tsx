import { PutObjectCommand } from "@aws-sdk/client-s3";
import { renderToBuffer } from "@react-pdf/renderer";
import type PgBoss from "pg-boss";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkSums } from "@/lib/invoice-validation";
import { invoiceFormSchema } from "@/lib/invoice-form-schema";
import type { InvoiceData } from "@/lib/types/invoice";
import { S3_BUCKET, s3, downloadBuffer } from "@/lib/s3";
import { combineCiiPdf, convertDocxToPdf, validateZugferd, type ValidationResult } from "@/lib/mustang";
import { generateCIIXml } from "@/server/zugferd/generate-xml";
import { PruefberichtTemplate, type ReportField } from "@/server/zugferd/pruefbericht-template";

type GenerateJob = { invoiceId: string; tenantId: string };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || typeof current !== "object") return undefined;
    if (/^\d+$/.test(key)) return (current as unknown[])[Number(key)];
    return (current as Record<string, unknown>)[key];
  }, value);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function makeReportFields(extracted: InvoiceData, confirmed: InvoiceData): ReportField[] {
  const paths = [
    "invoiceNumber", "invoiceDate", "deliveryDate",
    "sender.name", "sender.address", "sender.vatId", "sender.taxId",
    "recipient.name", "recipient.address", "recipient.vatId",
    ...confirmed.lineItems.flatMap((_, index) => [
      `lineItems.${index}.description`, `lineItems.${index}.quantity`,
      `lineItems.${index}.unitPrice`, `lineItems.${index}.totalPrice`, `lineItems.${index}.vatRate`,
    ]),
    ...confirmed.taxLines.flatMap((_, index) => [
      `taxLines.${index}.vatRate`, `taxLines.${index}.netAmount`, `taxLines.${index}.vatAmount`,
    ]),
    "netTotal", "vatTotal", "grossTotal", "currency", "paymentTerms",
    "bankDetails.iban", "bankDetails.bic", "flags",
  ];
  return paths.map((path) => {
    const extractedValue = pathValue(extracted, path);
    const confirmedValue = pathValue(confirmed, path);
    const pathLabel = path.replace(/^lineItems\.(\d+)/, "Position $1").replace(/^taxLines\.(\d+)/, "Steuerzeile $1");
    return {
      label: pathLabel,
      value: displayValue(confirmedValue),
      confidence: typeof extracted.confidence[path] === "number" ? extracted.confidence[path] : null,
      corrected: JSON.stringify(extractedValue) !== JSON.stringify(confirmedValue),
    };
  });
}

async function uploadBuffer(key: string, body: Uint8Array, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

async function setFailed(job: GenerateJob, message: string, validationResult?: ValidationResult) {
  const invoice = await db.invoice.findFirst({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    select: { extractedData: true },
  });
  await db.invoice.updateMany({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    data: {
      status: "FAILED",
      extractedData: { ...asObject(invoice?.extractedData), error: message },
      ...(validationResult ? { validationResult } : {}),
    },
  });
}

async function processGeneration(job: GenerateJob) {
  let validationResult: ValidationResult | undefined;
  try {
    if (!S3_BUCKET) throw new Error("S3 storage is not configured.");
    const invoice = await db.invoice.findFirst({
      where: { id: job.invoiceId, tenantId: job.tenantId, status: "GENERATING", deletedAt: null },
      select: {
        originalFileKey: true,
        originalFileType: true,
        isAmendment: true,
        originalInvoiceRef: true,
        confirmedData: true,
        extractedData: true,
        tenant: { select: { legalName: true } },
      },
    });
    if (!invoice) throw new Error("Confirmed invoice not found for generation.");
    if (invoice.originalFileType !== "pdf" && invoice.originalFileType !== "docx") {
      throw new Error("Unsupported source document type for ZUGFeRD generation.");
    }

    const confirmed = invoiceFormSchema.parse(invoice.confirmedData) as InvoiceData;
    const sums = checkSums(confirmed);
    if (!sums.valid) throw new Error(`Invoice sums are invalid: ${sums.discrepancies.join(" ")}`);
    const originalRefValue = asObject(invoice.originalInvoiceRef);
    const originalRef = invoice.isAmendment &&
      typeof originalRefValue.number === "string" && typeof originalRefValue.date === "string"
      ? { number: originalRefValue.number, date: originalRefValue.date }
      : undefined;
    if (invoice.isAmendment && !originalRef) throw new Error("Original invoice reference is missing.");

    const xml = await generateCIIXml(confirmed, invoice.isAmendment, originalRef);
    const sourceDocument = await downloadBuffer(invoice.originalFileKey);
    const originalPdf = invoice.originalFileType === "docx"
      ? await convertDocxToPdf(sourceDocument)
      : sourceDocument;
    const generatedPdf = await combineCiiPdf(originalPdf, xml);
    const outputKey = `${job.tenantId}/${job.invoiceId}/zugferd.pdf`;
    await uploadBuffer(outputKey, generatedPdf, "application/pdf");
    await db.invoice.updateMany({
      where: { id: job.invoiceId, tenantId: job.tenantId, status: "GENERATING" },
      data: { zugferdFileKey: outputKey },
    });

    validationResult = await validateZugferd(outputKey);
    await db.invoice.updateMany({
      where: { id: job.invoiceId, tenantId: job.tenantId, status: "GENERATING" },
      data: { validationResult },
    });
    if (!validationResult.valid) {
      await setFailed(job, "Die Mustang-Validierung der ZUGFeRD-Datei ist fehlgeschlagen.", validationResult);
      return;
    }

    const extracted = asObject(invoice.extractedData);
    const extractedFields = invoiceFormSchema.safeParse(extracted.fields);
    const reportBuffer = await renderToBuffer(
      <PruefberichtTemplate
        data={{
          generatedAt: new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }),
          tenantName: invoice.tenant.legalName,
          invoiceNumber: confirmed.invoiceNumber,
          invoiceDate: confirmed.invoiceDate,
          sender: confirmed.sender.name,
          recipient: confirmed.recipient.name,
          grossTotal: new Intl.NumberFormat("de-DE", { style: "currency", currency: confirmed.currency }).format(confirmed.grossTotal),
          fields: makeReportFields(extractedFields.success ? extractedFields.data as InvoiceData : confirmed, confirmed),
          validation: validationResult,
        }}
      />,
    );
    const reportKey = `${job.tenantId}/${job.invoiceId}/pruefbericht.pdf`;
    await uploadBuffer(reportKey, reportBuffer, "application/pdf");
    await db.invoice.updateMany({
      where: { id: job.invoiceId, tenantId: job.tenantId, status: "GENERATING" },
      data: { reportFileKey: reportKey, status: "DONE" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZUGFeRD generation failed.";
    await setFailed(job, message, validationResult);
    console.error(`ZUGFeRD generation failed for invoice ${job.invoiceId}`, error);
  }
}

export async function registerZugferdGenerationWorker(boss: PgBoss) {
  await boss.work<GenerateJob>("generate-zugferd", { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const parsed = z.object({ invoiceId: z.string().min(1), tenantId: z.string().min(1) }).safeParse(job.data);
      if (!parsed.success) throw new Error("Invalid generate-zugferd job payload.");
      await processGeneration(parsed.data);
    }
  });
}
