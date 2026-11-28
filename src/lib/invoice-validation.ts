import Decimal from "decimal.js";
import type { InvoiceData } from "@/lib/types/invoice";

export type SumCheckResult = {
  valid: boolean;
  discrepancies: string[];
};

function formatMoney(value: Decimal, currency: string): string {
  if (!value.isFinite()) return "—";
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: code }).format(value.toNumber());
}

function decimal(value: number): Decimal {
  return Number.isFinite(value) ? new Decimal(value) : new Decimal(NaN);
}

export function checkSums(data: InvoiceData): SumCheckResult {
  const discrepancies: string[] = [];
  const currency = data.currency || "EUR";
  const lineItemsTotal = data.lineItems.reduce(
    (sum, item) => sum.plus(decimal(item.totalPrice)),
    new Decimal(0),
  );
  const netTotal = decimal(data.netTotal);
  if (!lineItemsTotal.isFinite() || !netTotal.isFinite() || lineItemsTotal.minus(netTotal).abs().gt("0.02")) {
    discrepancies.push(
      `Nettopositionen (${formatMoney(lineItemsTotal, currency)}) stimmen nicht mit Nettosumme (${formatMoney(netTotal, currency)}) überein.`,
    );
  }

  data.taxLines.forEach((line, index) => {
    const netAmount = decimal(line.netAmount);
    const vatAmount = decimal(line.vatAmount);
    const expectedVat = netAmount.mul(decimal(line.vatRate)).div(100);
    if (!expectedVat.isFinite() || !vatAmount.isFinite() || expectedVat.minus(vatAmount).abs().gt("0.01")) {
      discrepancies.push(
        `Steuerzeile ${index + 1} (${line.vatRate}%): erwartet ${formatMoney(expectedVat, currency)}, erfasst ${formatMoney(vatAmount, currency)}.`,
      );
    }
  });

  const vatTotal = decimal(data.vatTotal);
  const grossTotal = decimal(data.grossTotal);
  const computedGross = netTotal.plus(vatTotal);
  if (!computedGross.isFinite() || !grossTotal.isFinite() || computedGross.minus(grossTotal).abs().gt("0.02")) {
    discrepancies.push(
      `Nettosumme plus Umsatzsteuer (${formatMoney(computedGross, currency)}) stimmen nicht mit Bruttosumme (${formatMoney(grossTotal, currency)}) überein.`,
    );
  }

  return { valid: discrepancies.length === 0, discrepancies };
}
