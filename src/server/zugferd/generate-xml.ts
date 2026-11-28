import Decimal from "decimal.js";
import { create } from "xmlbuilder2";
import { validateCiiXml } from "@/lib/mustang";
import type { InvoiceData } from "@/lib/types/invoice";

const NAMESPACES = {
  "xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  "xmlns:ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  "xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
  "xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
};

const PROFILE = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:comfort";
type XMLBuilder = ReturnType<typeof create>;

function add(parent: XMLBuilder, name: string, text?: string | number, attributes?: Record<string, string>): XMLBuilder {
  const child = parent.ele(name, attributes);
  if (text !== undefined) child.txt(String(text));
  return child;
}

function money(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Invoice amounts must be finite numbers.");
  return new Decimal(value).toFixed(2);
}

function dateCode(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid CII date: ${value}`);
  return `${match[1]}${match[2]}${match[3]}`;
}

function vatCategory(data: InvoiceData, rate: number): string {
  if (data.flags.includes("REVERSE_CHARGE")) return "AE";
  if (data.flags.includes("INNERGEMEINSCHAFTLICH")) return "K";
  return rate === 0 ? "Z" : "S";
}

function addPostalAddress(parent: XMLBuilder, address: string) {
  const postal = add(parent, "ram:PostalTradeAddress");
  add(postal, "ram:LineOne", address);
  add(postal, "ram:CountryID", "DE");
}

function addParty(parent: XMLBuilder, elementName: string, party: InvoiceData["sender"] | InvoiceData["recipient"]) {
  const seller = add(parent, elementName);
  add(seller, "ram:Name", party.name);
  addPostalAddress(seller, party.address);
  if (party.vatId) {
    const tax = add(seller, "ram:SpecifiedTaxRegistration");
    add(tax, "ram:ID", party.vatId, { schemeID: "VA" });
  }
  if ("taxId" in party && party.taxId) {
    const tax = add(seller, "ram:SpecifiedTaxRegistration");
    add(tax, "ram:ID", party.taxId, { schemeID: "FC" });
  }
  return seller;
}

export async function generateCIIXml(
  data: InvoiceData,
  isAmendment: boolean,
  originalRef?: { number: string; date: string },
): Promise<string> {
  if (isAmendment && (!originalRef?.number || !originalRef.date)) {
    throw new Error("An original invoice number and date are required for amendment invoices.");
  }

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("rsm:CrossIndustryInvoice", NAMESPACES);
  const context = add(root, "rsm:ExchangedDocumentContext");
  add(add(context, "ram:GuidelineSpecifiedDocumentContextParameter"), "ram:ID", PROFILE);

  const exchangedDocument = add(root, "rsm:ExchangedDocument");
  add(exchangedDocument, "ram:ID", data.invoiceNumber);
  add(exchangedDocument, "ram:TypeCode", data.flags.includes("GUTSCHRIFT") ? "381" : "380");
  const issueDate = add(exchangedDocument, "ram:IssueDateTime");
  add(issueDate, "udt:DateTimeString", dateCode(data.invoiceDate), { format: "102" });

  const transaction = add(root, "rsm:SupplyChainTradeTransaction");
  data.lineItems.forEach((line, index) => {
    const item = add(transaction, "ram:IncludedSupplyChainTradeLineItem");
    add(add(item, "ram:AssociatedDocumentLineDocument"), "ram:LineID", index + 1);
    add(add(item, "ram:SpecifiedTradeProduct"), "ram:Name", line.description);

    const agreement = add(item, "ram:SpecifiedLineTradeAgreement");
    const price = add(agreement, "ram:NetPriceProductTradePrice");
    add(price, "ram:ChargeAmount", money(line.unitPrice), { currencyID: data.currency });
    add(price, "ram:BasisQuantity", "1", { unitCode: "C62" });

    const delivery = add(item, "ram:SpecifiedLineTradeDelivery");
    add(delivery, "ram:BilledQuantity", line.quantity, { unitCode: "C62" });

    const settlement = add(item, "ram:SpecifiedLineTradeSettlement");
    const tax = add(settlement, "ram:ApplicableTradeTax");
    add(tax, "ram:TypeCode", "VAT");
    add(tax, "ram:CategoryCode", vatCategory(data, line.vatRate));
    add(tax, "ram:RateApplicablePercent", line.vatRate);
    const summation = add(settlement, "ram:SpecifiedTradeSettlementLineMonetarySummation");
    add(summation, "ram:LineTotalAmount", money(line.totalPrice), { currencyID: data.currency });
  });

  const headerAgreement = add(transaction, "ram:ApplicableHeaderTradeAgreement");
  addParty(headerAgreement, "ram:SellerTradeParty", data.sender);
  addParty(headerAgreement, "ram:BuyerTradeParty", data.recipient);
  if (isAmendment && originalRef) {
    const reference = add(headerAgreement, "ram:InvoiceReferencedDocument");
    add(reference, "ram:IssuerAssignedID", originalRef.number);
    const originalIssueDate = add(reference, "ram:FormattedIssueDateTime");
    add(originalIssueDate, "qdt:DateTimeString", dateCode(originalRef.date), { format: "102" });
  }

  if (data.deliveryDate) {
    const delivery = add(transaction, "ram:ApplicableHeaderTradeDelivery");
    const event = add(delivery, "ram:ActualDeliverySupplyChainEvent");
    const occurrence = add(event, "ram:OccurrenceDateTime");
    add(occurrence, "udt:DateTimeString", dateCode(data.deliveryDate), { format: "102" });
  }

  const settlement = add(transaction, "ram:ApplicableHeaderTradeSettlement");
  add(settlement, "ram:InvoiceCurrencyCode", data.currency);
  if (data.bankDetails?.iban) {
    const payment = add(settlement, "ram:SpecifiedTradeSettlementPaymentMeans");
    add(payment, "ram:TypeCode", "58");
    add(payment, "ram:Information", "SEPA-Überweisung");
    const account = add(payment, "ram:PayeePartyCreditorFinancialAccount");
    add(account, "ram:IBANID", data.bankDetails.iban);
    if (data.bankDetails.bic) {
      add(add(payment, "ram:PayeeSpecifiedCreditorFinancialInstitution"), "ram:BICID", data.bankDetails.bic);
    }
  }
  data.taxLines.forEach((taxLine) => {
    const tax = add(settlement, "ram:ApplicableTradeTax");
    add(tax, "ram:CalculatedAmount", money(taxLine.vatAmount), { currencyID: data.currency });
    add(tax, "ram:TypeCode", "VAT");
    add(tax, "ram:BasisAmount", money(taxLine.netAmount), { currencyID: data.currency });
    add(tax, "ram:CategoryCode", vatCategory(data, taxLine.vatRate));
    add(tax, "ram:RateApplicablePercent", taxLine.vatRate);
  });
  if (data.paymentTerms) {
    add(add(settlement, "ram:SpecifiedTradePaymentTerms"), "ram:Description", data.paymentTerms);
  }
  const monetarySummation = add(settlement, "ram:SpecifiedTradeSettlementHeaderMonetarySummation");
  add(monetarySummation, "ram:LineTotalAmount", money(data.netTotal), { currencyID: data.currency });
  add(monetarySummation, "ram:TaxBasisTotalAmount", money(data.netTotal), { currencyID: data.currency });
  add(monetarySummation, "ram:TaxTotalAmount", money(data.vatTotal), { currencyID: data.currency });
  add(monetarySummation, "ram:GrandTotalAmount", money(data.grossTotal), { currencyID: data.currency });
  add(monetarySummation, "ram:DuePayableAmount", money(data.grossTotal), { currencyID: data.currency });

  const xml = root.end({ prettyPrint: true });
  const validation = await validateCiiXml(xml);
  if (!validation.valid) {
    const details = validation.errors.map(({ id, message }) => `${id}: ${message}`).join("; ");
    throw new Error(`Generated CII XML failed validation: ${details || "unknown Mustang validation error"}`);
  }
  return xml;
}
