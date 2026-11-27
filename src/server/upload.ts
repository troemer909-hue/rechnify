"use server";

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { TenantRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { S3_BUCKET, s3 } from "@/lib/s3";
import { requireRole, UnauthorizedError } from "@/lib/rbac";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const uploadTypeSchema = z.enum(["new", "amendment"]);
const tenantIdSchema = z.string().min(1).max(191);

type DetectedType = { mime: string; ext: string } | null;

function detectFileType(buffer: Buffer): DetectedType {
  if (buffer.length < 4) return null;
  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  // DOCX (ZIP): PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
    };
  }
  return null;
}

export type UploadResult =
  | { invoiceId: string }
  | { error: string; status: number };

async function cleanUpUpload(invoiceId: string, tenantId: string, key: string) {
  try {
    await db.invoice.deleteMany({ where: { id: invoiceId, tenantId } });
  } catch (error) {
    console.error("Could not remove invoice after failed upload", error);
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (error) {
    console.error("Could not remove uploaded object after failed upload", error);
  }
}

export async function uploadInvoice(formData: FormData): Promise<UploadResult> {
  const fileValue = formData.get("file");
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return { error: "Bitte wähle eine PDF- oder DOCX-Datei aus.", status: 400 };
  }
  if (fileValue.size > MAX_FILE_SIZE) {
    return { error: "Die Datei darf höchstens 25 MB groß sein.", status: 413 };
  }

  const tenantIdResult = tenantIdSchema.safeParse(formData.get("tenantId"));
  const uploadTypeResult = uploadTypeSchema.safeParse(formData.get("type"));
  if (!tenantIdResult.success || !uploadTypeResult.success) {
    return { error: "Die Upload-Angaben sind ungültig.", status: 400 };
  }

  let context;
  try {
    context = await requireRole(TenantRole.EDITOR);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { error: "Du darfst in diesem Mandanten keine Rechnungen hochladen.", status: 403 };
    }
    throw error;
  }

  if (tenantIdResult.data !== context.tenantId) {
    return { error: "Der ausgewählte Mandant stimmt nicht mit deiner Sitzung überein.", status: 403 };
  }
  if (!S3_BUCKET) {
    console.error("S3_BUCKET is not configured");
    return { error: "Der Dateispeicher ist nicht verfügbar.", status: 503 };
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  const detected = detectFileType(buffer);
  if (!detected) {
    return { error: "Nur echte PDF- und DOCX-Dateien werden unterstützt.", status: 415 };
  }

  const invoiceId = randomUUID();
  const key = `${context.tenantId}/${invoiceId}/original.${detected.ext}`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: detected.mime,
      }),
    );
  } catch (error) {
    console.error("Invoice object upload failed", error);
    return { error: "Die Datei konnte nicht gespeichert werden. Bitte versuche es erneut.", status: 502 };
  }

  try {
    await db.invoice.create({
      data: {
        id: invoiceId,
        tenantId: context.tenantId,
        status: "UPLOADED",
        originalFileKey: key,
        originalFileType: detected.ext,
        isAmendment: uploadTypeResult.data === "amendment",
      },
    });

    const boss = await getQueue();
    const jobName = detected.ext === "pdf" ? "extract-pdf-text" : "extract-docx";
    const jobId = await boss.send(jobName, {
      invoiceId,
      tenantId: context.tenantId,
      originalFileKey: key,
      originalFileType: detected.ext,
    });
    if (!jobId) throw new Error("The extraction job could not be queued.");
  } catch (error) {
    console.error("Invoice record or extraction job creation failed", error);
    await cleanUpUpload(invoiceId, context.tenantId, key);
    return { error: "Die Datei wurde gespeichert, konnte aber nicht zur Verarbeitung eingereiht werden.", status: 503 };
  }

  return { invoiceId };
}
