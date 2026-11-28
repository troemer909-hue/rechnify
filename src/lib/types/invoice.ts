export type InvoiceData = {
  sender: { name: string; address: string; vatId?: string; taxId?: string };
  recipient: { name: string; address: string; vatId?: string };
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  deliveryDate?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    vatRate: number;
  }>;
  taxLines: Array<{ vatRate: number; netAmount: number; vatAmount: number }>;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  currency: string; // ISO 4217
  paymentTerms?: string;
  bankDetails?: { iban?: string; bic?: string };
  confidence: Partial<Record<string, number>>; // 0–1 per field path
  flags: Array<"GUTSCHRIFT" | "REVERSE_CHARGE" | "INNERGEMEINSCHAFTLICH" | "DREIECK">;
};

export type SenderMatch = {
  nameScore: number;
  vatIdMatch: boolean | null;
  overall: "ok" | "warning" | "mismatch";
};