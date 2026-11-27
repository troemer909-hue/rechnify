import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
