import { z } from "zod";

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  vatRate: z.number(),
});

const taxLineSchema = z.object({
  vatRate: z.number(),
  netAmount: z.number(),
  vatAmount: z.number(),
});

export const invoiceFormSchema = z.object({
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
  lineItems: z.array(lineItemSchema),
  taxLines: z.array(taxLineSchema),
  netTotal: z.number(),
  vatTotal: z.number(),
  grossTotal: z.number(),
  currency: z.string(),
  paymentTerms: z.string().optional(),
  bankDetails: z.object({ iban: z.string().optional(), bic: z.string().optional() }).optional(),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  flags: z.array(z.enum(["GUTSCHRIFT", "REVERSE_CHARGE", "INNERGEMEINSCHAFTLICH", "DREIECK"])),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
