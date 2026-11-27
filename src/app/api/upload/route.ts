import { NextResponse } from "next/server";
import { uploadInvoice } from "@/server/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 26 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Die Datei darf höchstens 25 MB groß sein." },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Die Upload-Anfrage konnte nicht gelesen werden." },
      { status: 400 },
    );
  }

  const result = await uploadInvoice(formData);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ invoiceId: result.invoiceId }, { status: 201 });
}
