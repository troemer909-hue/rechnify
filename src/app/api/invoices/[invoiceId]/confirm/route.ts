import { NextResponse } from "next/server";
import { TenantRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoiceFormSchema } from "@/lib/invoice-form-schema";
import { checkSums } from "@/lib/invoice-validation";
import { getQueue } from "@/lib/queue";
import { requireRole, UnauthorizedError } from "@/lib/rbac";

const confirmationSchema = z.object({
  fields: invoiceFormSchema,
  issuerConfirmed: z.literal(true),
  acknowledgedFlags: z.array(z.enum(["GUTSCHRIFT", "REVERSE_CHARGE", "INNERGEMEINSCHAFTLICH", "DREIECK"])),
  senderMismatchAcknowledged: z.boolean(),
});

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  let context;
  try {
    context = await requireRole(TenantRole.REVIEWER);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { invoiceId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = confirmationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte bestätigen Sie die Rechnungsangaben." }, { status: 400 });
  }

  const { fields } = parsed.data;
  const missingRequired = [
    ["invoiceNumber", fields.invoiceNumber],
    ["invoiceDate", fields.invoiceDate],
    ["sender.name", fields.sender.name],
    ["sender.address", fields.sender.address],
    ["recipient.name", fields.recipient.name],
    ["currency", fields.currency],
  ].filter(([, value]) => typeof value !== "string" || !value.trim()).map(([name]) => name);
  if (!Number.isFinite(fields.grossTotal)) missingRequired.push("grossTotal");
  if (missingRequired.length) {
    return NextResponse.json({ error: "Pflichtfelder fehlen.", fields: missingRequired }, { status: 400 });
  }
  const sums = checkSums(fields);
  if (!sums.valid) {
    return NextResponse.json({ error: "Summenabweichung.", discrepancies: sums.discrepancies }, { status: 400 });
  }
  const unacknowledged = fields.flags.filter((flag) => !parsed.data.acknowledgedFlags.includes(flag));
  if (unacknowledged.length) {
    return NextResponse.json({ error: "Bitte bestätigen Sie alle Hinweise zu Rechnungstypen." }, { status: 400 });
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: context.tenantId, status: "REVIEW", deletedAt: null },
    select: { extractedData: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Rechnung nicht gefunden oder nicht mehr in Prüfung." }, { status: 404 });
  }
  const extractedData = asObject(invoice.extractedData);
  if (asObject(extractedData.senderMatch).overall === "mismatch" && !parsed.data.senderMismatchAcknowledged) {
    return NextResponse.json({ error: "Bitte bestätigen Sie, dass Sie den Absenderhinweis gelesen haben." }, { status: 400 });
  }

  const updated = await db.invoice.updateMany({
    where: { id: invoiceId, tenantId: context.tenantId, status: "REVIEW", deletedAt: null },
    data: {
      confirmedData: fields,
      confirmedAt: new Date(),
      confirmedBy: context.session.userId,
      status: "GENERATING",
      extractedData: { ...extractedData, fields },
    },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: "Die Rechnung wurde zwischenzeitlich geändert." }, { status: 409 });
  }

  try {
    const queue = await getQueue();
    const jobId = await queue.send("generate-zugferd", { invoiceId, tenantId: context.tenantId });
    if (!jobId) throw new Error("The ZUGFeRD job could not be queued.");
  } catch (error) {
    await db.invoice.updateMany({
      where: { id: invoiceId, tenantId: context.tenantId, status: "GENERATING" },
      data: {
        status: "FAILED",
        extractedData: { ...extractedData, error: "Die ZUGFeRD-Erstellung konnte nicht gestartet werden." },
      },
    });
    console.error("Could not start ZUGFeRD generation", error);
    return NextResponse.json({ error: "Die Erstellung konnte nicht gestartet werden." }, { status: 503 });
  }

  return NextResponse.json({ status: "GENERATING" }, { status: 202 });
}
