import Anthropic from "@anthropic-ai/sdk";
import type PgBoss from "pg-boss";
import { z } from "zod";
import { db } from "@/lib/db";
import { nameSimilarity } from "@/lib/fuzzy";
import type { InvoiceData, SenderMatch } from "@/lib/types/invoice";

type ExtractFieldsJob = { invoiceId: string; tenantId: string };

const invoiceDataSchema = z.object({
  sender: z.object({
    name: z.string(),
    address: z.string(),
    vatId: z.string().optional(),
    taxId: z.string().optional(),
  }),
  recipient: z.object({
    name: z.string(),
    address: z.string(),
    vatId: z.string().optional(),
  }),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  deliveryDate: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    vatRate: z.number(),
  })),
  taxLines: z.array(z.object({
    vatRate: z.number(),
    netAmount: z.number(),
    vatAmount: z.number(),
  })),
  netTotal: z.number(),
  vatTotal: z.number(),
  grossTotal: z.number(),
  currency: z.string(),
  paymentTerms: z.string().optional(),
  bankDetails: z.object({ iban: z.string().optional(), bic: z.string().optional() }).optional(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  flags: z.array(z.enum(["GUTSCHRIFT", "REVERSE_CHARGE", "INNERGEMEINSCHAFTLICH", "DREIECK"])),
});

const extractionPrompt = `Extract structured data from this German invoice text. Return a JSON object matching this shape:
{
  "sender": {"name": "string", "address": "string", "vatId": "string (optional)", "taxId": "string (optional)"},
  "recipient": {"name": "string", "address": "string", "vatId": "string (optional)"},
  "invoiceNumber": "string", "invoiceDate": "YYYY-MM-DD", "deliveryDate": "YYYY-MM-DD (optional)",
  "lineItems": [{"description": "string", "quantity": 0, "unitPrice": 0, "totalPrice": 0, "vatRate": 0}],
  "taxLines": [{"vatRate": 0, "netAmount": 0, "vatAmount": 0}],
  "netTotal": 0, "vatTotal": 0, "grossTotal": 0, "currency": "ISO 4217 code",
  "paymentTerms": "string (optional)", "bankDetails": {"iban": "string (optional)", "bic": "string (optional)"},
  "confidence": {"field.path": 0.0}, "flags": []
}

Use numbers without currency symbols. Convert dates to YYYY-MM-DD. Include a confidence score from 0.0 to 1.0 for every extracted field using paths such as "invoiceNumber", "sender.name", "lineItems.0.totalPrice". Use lower confidence when text is unclear or inferred. Set flags to any applicable values: GUTSCHRIFT for a credit note, REVERSE_CHARGE for reverse charge, INNERGEMEINSCHAFTLICH for intra-community supply, DREIECK for triangular trade. Use an empty string for unavailable required string fields, empty arrays when there are no items, and only include optional fields when present.

Invoice text:
`;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeVatId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function compareSender(
  sender: InvoiceData["sender"],
  tenant: { name: string; legalName: string; vatId: string | null },
): SenderMatch {
  const nameScore = Math.max(
    nameSimilarity(sender.name, tenant.name),
    nameSimilarity(sender.name, tenant.legalName),
  );
  const senderVatId = sender.vatId?.trim();
  const tenantVatId = tenant.vatId?.trim();
  const vatIdMatch = senderVatId && tenantVatId
    ? normalizeVatId(senderVatId) === normalizeVatId(tenantVatId)
    : null;

  let overall: SenderMatch["overall"];
  if (nameScore < 0.5) overall = "mismatch";
  else if (nameScore < 0.8 || vatIdMatch !== true) overall = "warning";
  else overall = "ok";

  return { nameScore, vatIdMatch, overall };
}

async function failInvoice(job: ExtractFieldsJob, message: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    select: { extractedData: true },
  });
  if (!invoice) return;
  await db.invoice.updateMany({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    data: {
      status: "FAILED",
      extractedData: { ...asObject(invoice.extractedData), error: message },
    },
  });
}

async function processJob(job: ExtractFieldsJob) {
  await db.invoice.updateMany({
    where: { id: job.invoiceId, tenantId: job.tenantId },
    data: { status: "EXTRACTING" },
  });

  try {
    const invoice = await db.invoice.findFirst({
      where: { id: job.invoiceId, tenantId: job.tenantId },
      select: {
        extractedData: true,
        tenant: { select: { name: true, legalName: true, vatId: true } },
      },
    });
    if (!invoice) throw new Error("Invoice not found for field extraction");
    const existingData = asObject(invoice.extractedData);
    const rawText = existingData.rawText;
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw new Error("Invoice has no extracted text to analyze");
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: `${extractionPrompt}${rawText}\n\nOutput JSON only, no markdown.` }],
    });
    const answer = response.content.find((block) => block.type === "text");
    if (!answer || answer.type !== "text") throw new Error("Claude returned no text response");

    let decoded: unknown;
    try {
      decoded = JSON.parse(answer.text);
    } catch {
      throw new Error("Claude returned invalid JSON for invoice fields");
    }
    const fields = invoiceDataSchema.parse(decoded) as InvoiceData;
    const requiredValues: Array<[string, string]> = [
      ["invoiceNumber", fields.invoiceNumber],
      ["invoiceDate", fields.invoiceDate],
      ["sender.name", fields.sender.name],
      ["recipient.name", fields.recipient.name],
    ];
    const missing = requiredValues.filter(([, value]) => !value.trim()).map(([name]) => name);
    if (fields.grossTotal === null || !Number.isFinite(fields.grossTotal)) missing.push("grossTotal");
    if (missing.length) throw new Error(`Required invoice fields are missing: ${missing.join(", ")}`);
    const senderMatch = compareSender(fields.sender, invoice.tenant);

    await db.invoice.updateMany({
      where: { id: job.invoiceId, tenantId: job.tenantId },
      data: {
        status: "REVIEW",
        extractedData: {
          ...existingData,
          fields,
          senderMatch,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            model: response.model,
          },
          error: null,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown field extraction error";
    await failInvoice(job, message);
  }
}

export async function registerFieldExtractionWorker(boss: PgBoss) {
  await boss.work<ExtractFieldsJob>("extract-fields", { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await processJob(job.data);
  });
}
