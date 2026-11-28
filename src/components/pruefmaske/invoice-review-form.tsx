"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { InvoiceData, SenderMatch } from "@/lib/types/invoice";
import { invoiceFormSchema, type InvoiceFormValues } from "@/lib/invoice-form-schema";
import { checkSums } from "@/lib/invoice-validation";

const REQUIRED_PATHS = [
  "invoiceNumber",
  "invoiceDate",
  "sender.name",
  "sender.address",
  "recipient.name",
  "grossTotal",
  "currency",
] as const;

const FLAG_MESSAGES: Record<InvoiceData["flags"][number], string> = {
  GUTSCHRIFT: "Diese Rechnung enthält eine Gutschrift. Bitte prüfen Sie, ob der Rechnungstyp korrekt gesetzt ist.",
  REVERSE_CHARGE: "Reverse-Charge-Verfahren erkannt. Der Leistungsempfänger schuldet die Steuer. Bitte prüfen Sie die steuerlichen Angaben sorgfältig.",
  INNERGEMEINSCHAFTLICH: "Innergemeinschaftliche Lieferung erkannt. Es gelten besondere steuerliche Anforderungen.",
  DREIECK: "Mögliches Dreiecksgeschäft erkannt. Bitte lassen Sie diese Rechnung steuerlich prüfen, bevor Sie fortfahren.",
};

function getPathValue(values: InvoiceFormValues, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    if (/^\d+$/.test(key)) return (value as unknown[])[Number(key)];
    return (value as Record<string, unknown>)[key];
  }, values);
}

function isEmpty(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length === 0 : typeof value !== "number" || !Number.isFinite(value);
}

function FieldShell({
  label,
  path,
  confidence,
  required,
  value,
  children,
}: {
  label: string;
  path: string;
  confidence: Record<string, number>;
  required?: boolean;
  value: unknown;
  children: React.ReactNode;
}) {
  const score = confidence[path];
  const missing = required && isEmpty(value);
  const low = typeof score === "number" && score < 0.7;
  const medium = typeof score === "number" && score >= 0.7 && score < 0.9;
  const indicatorClass = missing || low
    ? "border-l-4 border-l-red-500 pl-3"
    : medium
      ? "border-l-4 border-l-yellow-400 pl-3"
      : "border-l-4 border-l-transparent pl-3";

  return (
    <div className={`min-w-0 ${indicatorClass}`}>
      <div className="mb-1 flex min-h-5 items-center gap-2">
        <label htmlFor={path} className="text-sm font-medium">{label}</label>
        {missing && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">Pflichtfeld</span>}
        {score !== undefined && score < 0.9 && (
          <span
            title={`Erkennungssicherheit: ${(score * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`}
            aria-label={`Erkennungssicherheit: ${(score * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`}
            className={low ? "text-red-700" : "text-yellow-700"}
          >
            {low ? <CircleAlert size={15} aria-hidden="true" /> : <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" aria-hidden="true" />}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function inputClass(invalid = false) {
  return `w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${invalid ? "border-red-500" : ""}`;
}

function TextField({
  label,
  name,
  confidence,
  required = false,
  register,
  value,
  type = "text",
}: {
  label: string;
  name: keyof InvoiceFormValues | `sender.${string}` | `recipient.${string}` | `bankDetails.${string}`;
  confidence: Record<string, number>;
  required?: boolean;
  register: ReturnType<typeof useForm<InvoiceFormValues>>["register"];
  value: unknown;
  type?: string;
}) {
  const path = String(name);
  const requiredForIssue = (REQUIRED_PATHS as readonly string[]).includes(path);
  return (
    <FieldShell label={label} path={path} confidence={confidence} required={required || requiredForIssue} value={value}>
      <input id={path} type={type} step={type === "number" ? "any" : undefined} {...register(name as never, type === "number" ? { valueAsNumber: true } : undefined)} className={inputClass(requiredForIssue && isEmpty(value))} />
    </FieldShell>
  );
}

export function InvoiceReviewForm({
  invoiceId,
  initialData,
  senderMatch,
  ocrConfidence,
}: {
  invoiceId: string;
  initialData: InvoiceData;
  senderMatch: SenderMatch | null;
  ocrConfidence: number | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [flagConfirmations, setFlagConfirmations] = useState<Record<string, boolean>>({});
  const [hiddenFlagBanners, setHiddenFlagBanners] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: initialData,
    mode: "onChange",
  });
  const { register, control, handleSubmit, reset, setValue, formState: { isSubmitting, isValid } } = form;
  const lineItems = useFieldArray({ control, name: "lineItems" });
  const taxLines = useFieldArray({ control, name: "taxLines" });
  const values = useWatch({ control }) as InvoiceFormValues;
  const confidence = values?.confidence ?? {};

  useEffect(() => {
    try {
      const draft = localStorage.getItem(`invoice-review:${invoiceId}`);
      if (draft) {
        const parsed = invoiceFormSchema.safeParse(JSON.parse(draft));
        if (parsed.success) reset(parsed.data);
      }
    } catch {
      localStorage.removeItem(`invoice-review:${invoiceId}`);
    }
    setHydrated(true);
  }, [invoiceId, reset]);

  useEffect(() => {
    if (!hydrated || !values) return;
    localStorage.setItem(`invoice-review:${invoiceId}`, JSON.stringify(values));
  }, [hydrated, invoiceId, values]);

  const missingRequired = useMemo(
    () => REQUIRED_PATHS.filter((path) => isEmpty(getPathValue(values, path))),
    [values],
  );
  const activeFlags = values?.flags ?? [];
  const unconfirmedFlags = activeFlags.filter((flag) => !flagConfirmations[flag]);
  const mismatchBlocked = senderMatch?.overall === "mismatch" && !mismatchDismissed;
  const sumCheck = useMemo(() => checkSums(values), [values]);
  const canSubmit = hydrated && isValid && missingRequired.length === 0 && !mismatchBlocked && unconfirmedFlags.length === 0 && sumCheck.valid;

  async function saveInvoice(data: InvoiceFormValues) {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: data }),
      });
      if (!response.ok) throw new Error("Speichern fehlgeschlagen");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit(saveInvoice)} className="space-y-6 pb-10">
      {senderMatch?.overall === "mismatch" && !mismatchDismissed && (
        <div role="alert" className="flex gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-950">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Absender stimmt nicht mit dem Mandanten überein.</p>
            <p className="mt-1 text-sm">Bitte prüfen Sie die hochgeladene Rechnung sorgfältig. Name-Übereinstimmung: {Math.round(senderMatch.nameScore * 100)}%.</p>
            <button type="button" onClick={() => setMismatchDismissed(true)} className="mt-3 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2">
              Hinweis gelesen — fortfahren
            </button>
          </div>
        </div>
      )}

      {ocrConfidence !== null && ocrConfidence < 70 && (
        <div role="status" className="flex gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-950">
          <Info className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <p className="text-sm">Scan-Qualität niedrig (OCR-Konfidenz: {Math.round(ocrConfidence)}%). Bitte alle Felder sorgfältig prüfen.</p>
        </div>
      )}

      {activeFlags.map((flag) => (
        <section key={flag} className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          {!hiddenFlagBanners[flag] && (
            <div role="alert" className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <p className="flex-1 text-sm font-medium">{FLAG_MESSAGES[flag]}</p>
              <button type="button" aria-label="Hinweis ausblenden" onClick={() => setHiddenFlagBanners((current) => ({ ...current, [flag]: true }))} className="rounded p-1 hover:bg-amber-100 focus-visible:outline-2"><X size={16} /></button>
            </div>
          )}
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(flagConfirmations[flag])}
              onChange={(event) => setFlagConfirmations((current) => ({ ...current, [flag]: event.target.checked }))}
              className="mt-1 accent-amber-700"
            />
            <span>Ich habe den Hinweis gelesen und bestätige, die Angaben geprüft zu haben.</span>
          </label>
        </section>
      ))}

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Absender</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="sender.name" confidence={confidence} required register={register} value={values?.sender?.name} />
          <TextField label="Adresse" name="sender.address" confidence={confidence} required register={register} value={values?.sender?.address} />
          <TextField label="USt-ID" name="sender.vatId" confidence={confidence} register={register} value={values?.sender?.vatId} />
          <TextField label="Steuernummer" name="sender.taxId" confidence={confidence} register={register} value={values?.sender?.taxId} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Empfänger</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="recipient.name" confidence={confidence} required register={register} value={values?.recipient?.name} />
          <TextField label="Adresse" name="recipient.address" confidence={confidence} register={register} value={values?.recipient?.address} />
          <TextField label="USt-ID" name="recipient.vatId" confidence={confidence} register={register} value={values?.recipient?.vatId} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Rechnungsdetails</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Rechnungsnummer" name="invoiceNumber" confidence={confidence} required register={register} value={values?.invoiceNumber} />
          <TextField label="Rechnungsdatum" name="invoiceDate" confidence={confidence} required register={register} value={values?.invoiceDate} type="date" />
          <TextField label="Lieferdatum" name="deliveryDate" confidence={confidence} register={register} value={values?.deliveryDate} type="date" />
          <TextField label="Zahlungsbedingungen" name="paymentTerms" confidence={confidence} register={register} value={values?.paymentTerms} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Positionen</h2>
          <button type="button" onClick={() => lineItems.append({ description: "", quantity: 1, unitPrice: 0, totalPrice: 0, vatRate: 19 })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Position hinzufügen</button>
        </div>
        <div className="space-y-4">
          {lineItems.fields.map((item, index) => (
            <fieldset key={item.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3">
              <legend className="px-1 text-xs text-muted-foreground">Position {index + 1}</legend>
              <TextField label="Beschreibung" name={`lineItems.${index}.description` as never} confidence={confidence} register={register} value={values?.lineItems?.[index]?.description} />
              <TextField label="Menge" name={`lineItems.${index}.quantity` as never} confidence={confidence} register={register} value={values?.lineItems?.[index]?.quantity} type="number" />
              <TextField label="Einzelpreis" name={`lineItems.${index}.unitPrice` as never} confidence={confidence} register={register} value={values?.lineItems?.[index]?.unitPrice} type="number" />
              <TextField label="Nettobetrag" name={`lineItems.${index}.totalPrice` as never} confidence={confidence} register={register} value={values?.lineItems?.[index]?.totalPrice} type="number" />
              <TextField label="USt. %" name={`lineItems.${index}.vatRate` as never} confidence={confidence} register={register} value={values?.lineItems?.[index]?.vatRate} type="number" />
              <button type="button" onClick={() => lineItems.remove(index)} className="self-end rounded-md px-3 py-2 text-sm text-destructive hover:bg-red-50">Position entfernen</button>
            </fieldset>
          ))}
          {lineItems.fields.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Positionen erfasst.</p>}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Steuer &amp; Summen</h2>
          <button type="button" onClick={() => taxLines.append({ vatRate: 19, netAmount: 0, vatAmount: 0 })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Steuerzeile hinzufügen</button>
        </div>
        <div className="space-y-3">
          {taxLines.fields.map((item, index) => (
            <fieldset key={item.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-4">
              <legend className="px-1 text-xs text-muted-foreground">Steuerzeile {index + 1}</legend>
              <TextField label="USt. %" name={`taxLines.${index}.vatRate` as never} confidence={confidence} register={register} value={values?.taxLines?.[index]?.vatRate} type="number" />
              <TextField label="Nettobetrag" name={`taxLines.${index}.netAmount` as never} confidence={confidence} register={register} value={values?.taxLines?.[index]?.netAmount} type="number" />
              <TextField label="Steuerbetrag" name={`taxLines.${index}.vatAmount` as never} confidence={confidence} register={register} value={values?.taxLines?.[index]?.vatAmount} type="number" />
              <button type="button" onClick={() => taxLines.remove(index)} className="self-end rounded-md px-3 py-2 text-sm text-destructive hover:bg-red-50">Steuerzeile entfernen</button>
            </fieldset>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField label="Nettosumme" name="netTotal" confidence={confidence} register={register} value={values?.netTotal} type="number" />
          <TextField label="Umsatzsteuer" name="vatTotal" confidence={confidence} register={register} value={values?.vatTotal} type="number" />
          <TextField label="Bruttosumme" name="grossTotal" confidence={confidence} required register={register} value={values?.grossTotal} type="number" />
          <TextField label="Währung (ISO 4217)" name="currency" confidence={confidence} required register={register} value={values?.currency} />
          <TextField label="IBAN" name="bankDetails.iban" confidence={confidence} register={register} value={values?.bankDetails?.iban} />
          <TextField label="BIC" name="bankDetails.bic" confidence={confidence} register={register} value={values?.bankDetails?.bic} />
        </div>
        {sumCheck.valid ? (
          <p role="status" className="mt-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
            <Check size={17} aria-hidden="true" /> Summenprüfung erfolgreich.
          </p>
        ) : (
          <div role="alert" className="mt-5 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="mb-1 font-semibold">Summenabweichung</p>
            <ul className="list-inside list-disc space-y-1">
              {sumCheck.discrepancies.map((message) => <li key={message}>{message}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Rechnungstypen</h2>
        <p className="mb-4 text-sm text-muted-foreground">Korrigieren Sie die erkannten Sondertypen, falls nötig.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["GUTSCHRIFT", "Gutschrift"],
            ["REVERSE_CHARGE", "Reverse Charge"],
            ["INNERGEMEINSCHAFTLICH", "Innergemeinschaftliche Lieferung"],
            ["DREIECK", "Dreiecksgeschäft"],
          ] as const).map(([flag, label]) => (
            <label key={flag} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={activeFlags.includes(flag)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...activeFlags, flag]
                    : activeFlags.filter((current) => current !== flag);
                  setValue("flags", next, { shouldDirty: true, shouldValidate: true });
                  setFlagConfirmations((current) => ({ ...current, [flag]: false }));
                  setHiddenFlagBanners((current) => ({ ...current, [flag]: false }));
                }}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm" aria-live="polite">
          {saveState === "saved" && <span className="inline-flex items-center gap-1 text-green-700"><Check size={16} /> Änderungen gespeichert.</span>}
          {saveState === "error" && <span className="text-red-700">Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.</span>}
          {(!canSubmit && !mismatchBlocked) && missingRequired.length > 0 && <span className="text-red-700">Bitte füllen Sie alle Pflichtfelder aus.</span>}
          {unconfirmedFlags.length > 0 && <span className="ml-2 text-amber-800">Bitte bestätigen Sie alle Rechnungshinweise.</span>}
          {mismatchBlocked && <span className="text-red-700">Bitte bestätigen Sie zuerst, dass Sie den Absenderhinweis gelesen haben.</span>}
          {!sumCheck.valid && <span className="text-red-700"> Bitte korrigieren Sie die Summenabweichung.</span>}
        </div>
        <button type="submit" title={!sumCheck.valid ? "Bitte korrigieren Sie die Summenabweichung." : undefined} disabled={!canSubmit || isSubmitting || saveState === "saving"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
          {isSubmitting || saveState === "saving" ? "Speichern…" : "Prüfung speichern"}
        </button>
      </div>
    </form>
  );
}
