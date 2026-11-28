import { NextResponse } from "next/server";
import { TenantRole } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { invoiceFormSchema } from "@/lib/invoice-form-schema";
import { checkSums } from "@/lib/invoice-validation";
import { requireRole, UnauthorizedError } from "@/lib/rbac";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getSession();
  if (!session?.activeTenantId) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { invoiceId } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: session.activeTenantId },
    select: { status: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Rechnung nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json({ status: invoice.status });
}

export async function PATCH(
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
  const bodyResult = z.object({ fields: invoiceFormSchema }).safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json({ error: "Die Rechnungsdaten sind ungültig." }, { status: 400 });
  }
  const fields = bodyResult.data.fields;
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
  const sumCheck = checkSums(fields);
  if (!sumCheck.valid) {
    return NextResponse.json({ error: "Summenabweichung.", discrepancies: sumCheck.discrepancies }, { status: 400 });
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: context.tenantId, status: "REVIEW", deletedAt: null },
    select: { extractedData: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Rechnung nicht gefunden oder nicht mehr in Prüfung." }, { status: 404 });
  }

  const extractedData = invoice.extractedData && typeof invoice.extractedData === "object" && !Array.isArray(invoice.extractedData)
    ? invoice.extractedData as Record<string, unknown>
    : {};
  const saved = await db.invoice.updateMany({
    where: { id: invoiceId, tenantId: context.tenantId, status: "REVIEW", deletedAt: null },
    data: {
      extractedData: { ...extractedData, fields },
    },
  });
  if (saved.count !== 1) {
    return NextResponse.json({ error: "Die Rechnung wurde zwischenzeitlich geändert." }, { status: 409 });
  }
  return NextResponse.json({ saved: true });
}
