import { fromBuffer } from "pdf2pic";
import { createWorker } from "tesseract.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { downloadBuffer } from "@/lib/s3";

const jobDataSchema = z.object({
  invoiceId: z.string().min(1),
  tenantId: z.string().min(1),
  originalFileKey: z.string().min(1),
});

function asJsonObject(value: unknown): Prisma.InputJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

export async function extractOcr(data: unknown): Promise<void> {
  const { invoiceId, tenantId, originalFileKey } = jobDataSchema.parse(data);

  const started = await db.invoice.updateMany({
    where: { id: invoiceId, tenantId },
    data: { status: "EXTRACTING" },
  });
  if (started.count !== 1) {
    throw new Error(`Invoice ${invoiceId} was not found for tenant ${tenantId}`);
  }

  const pdf = await downloadBuffer(originalFileKey);
  const renderedPages = await fromBuffer(pdf, {
    density: 300,
    format: "png",
    height: 3508,
    preserveAspectRatio: true,
    width: 2480,
  }).bulk(-1, { responseType: "buffer" });
  const images = renderedPages.flatMap((page) =>
    page.buffer ? [page.buffer] : [],
  );

  let rawText = "";
  let wordConfidences: number[] = [];
  const worker = await createWorker("deu+eng");
  try {
    for (const image of images) {
      const { data: result } = await worker.recognize(image);
      rawText += `${result.text.trim()}\n`;
      wordConfidences = wordConfidences.concat(
        result.words
          .filter((word) => word.text.trim().length > 0)
          .map((word) => word.confidence),
      );
    }
  } finally {
    await worker.terminate();
  }

  rawText = rawText.trim();
  const ocrConfidence = wordConfidences.length
    ? wordConfidences.reduce((sum, confidence) => sum + confidence, 0) /
      wordConfidences.length
    : 0;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { extractedData: true },
  });
  if (!invoice) throw new Error(`Invoice ${invoiceId} disappeared during OCR`);

  const extractedData: Prisma.InputJsonObject = {
    ...asJsonObject(invoice.extractedData),
    rawText,
    ocrConfidence,
  };

  if (!rawText) {
    await db.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: { extractedData, status: "FAILED" },
    });
    return;
  }

  await db.invoice.updateMany({
    where: { id: invoiceId, tenantId },
    data: { extractedData },
  });

  const boss = await getQueue();
  const nextJobId = await boss.send("extract-fields", { invoiceId, tenantId });
  if (!nextJobId) {
    throw new Error(`Could not enqueue field extraction for invoice ${invoiceId}`);
  }
}
