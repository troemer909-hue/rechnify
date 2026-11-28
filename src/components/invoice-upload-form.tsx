"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

type UploadResponse = { invoiceId?: string; error?: string };

export function InvoiceUploadForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const stopped = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<"new" | "amendment">("new");
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState("");
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  function chooseFile(nextFile?: File) {
    setError("");
    setStatus("");
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Die Datei darf höchstens 25 MB groß sein.");
      return;
    }
    setFile(nextFile);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  async function pollStatus(invoiceId: string) {
    setProcessing(true);
    setStatus("Datei hochgeladen. Verarbeitung läuft …");

    for (let attempt = 0; attempt < 300 && !stopped.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as { status?: string; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Der Rechnungsstatus konnte nicht geladen werden.");

        if (result.status === "REVIEW") {
          router.replace(`/app/invoices/${encodeURIComponent(invoiceId)}/review`);
          router.refresh();
          return;
        }
        if (result.status === "FAILED") {
          setError("Die Verarbeitung ist fehlgeschlagen. Bitte lade die Datei erneut hoch.");
          setProcessing(false);
          return;
        }
        if (result.status === "EXTRACTING") setStatus("Rechnungsdaten werden erkannt …");
        else setStatus("Datei hochgeladen. Verarbeitung läuft …");
      } catch (pollError) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Der Rechnungsstatus konnte nicht geladen werden.",
        );
        setProcessing(false);
        return;
      }
    }

    if (!stopped.current) {
      setError("Die Verarbeitung dauert länger als erwartet. Du kannst den Status später erneut prüfen.");
      setProcessing(false);
    }
  }

  async function submit() {
    if (!file || uploading || processing) return;
    if (file.size > MAX_FILE_SIZE) {
      setError("Die Datei darf höchstens 25 MB groß sein.");
      return;
    }
    if (type === "amendment" && (!originalInvoiceNumber.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(originalInvoiceDate))) {
      setError("Bitte gib Rechnungsnummer und Rechnungsdatum des Originals an.");
      return;
    }

    setError("");
    setProgress(0);
    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("tenantId", tenantId);
    formData.set("type", type);
    if (type === "amendment") {
      formData.set("originalInvoiceNumber", originalInvoiceNumber.trim());
      formData.set("originalInvoiceDate", originalInvoiceDate);
    }

    const result = await new Promise<{ response: UploadResponse; status: number }>((resolve) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/upload");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => resolve({ response: { error: "Die Verbindung ist fehlgeschlagen." }, status: 0 });
      request.onload = () => {
        let response: UploadResponse = {};
        try {
          response = JSON.parse(request.responseText) as UploadResponse;
        } catch {
          response = { error: "Der Server hat eine ungültige Antwort gesendet." };
        }
        resolve({ response, status: request.status });
      };
      request.send(formData);
    });

    setUploading(false);
    if (result.status < 200 || result.status >= 300 || !result.response.invoiceId) {
      setError(result.response.error ?? "Der Upload ist fehlgeschlagen.");
      return;
    }

    setProgress(100);
    await pollStatus(result.response.invoiceId);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-muted" : "border-border"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onFileChange}
          className="sr-only"
          aria-label="PDF- oder DOCX-Datei auswählen"
        />
        <p className="font-medium">Datei hier ablegen</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF oder DOCX, maximal 25 MB</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || processing}
          className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          Datei auswählen
        </button>
        {file && <p className="mt-4 break-all text-sm">{file.name}</p>}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          checked={type === "amendment"}
          onChange={(event) => {
            const nextType = event.target.checked ? "amendment" : "new";
            setType(nextType);
            if (nextType === "new") {
              setOriginalInvoiceNumber("");
              setOriginalInvoiceDate("");
            }
          }}
          disabled={uploading || processing}
          className="mt-1"
        />
        <span>
          <span className="block text-sm font-medium">Berichtigung zu versandter Rechnung</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Markiert den Upload als Berichtigung einer bereits versandten Rechnung.
          </span>
        </span>
      </label>

      {type === "amendment" && (
        <div className="grid gap-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Rechnungsnummer des Originals
            <input
              type="text"
              value={originalInvoiceNumber}
              onChange={(event) => setOriginalInvoiceNumber(event.target.value)}
              maxLength={120}
              required
              disabled={uploading || processing}
              className="rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Rechnungsdatum des Originals
            <input
              type="date"
              value={originalInvoiceDate}
              onChange={(event) => setOriginalInvoiceDate(event.target.value)}
              required
              disabled={uploading || processing}
              className="rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
        </div>
      )}

      {uploading && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span>Datei wird hochgeladen …</span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload-Fortschritt"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {processing && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!file || uploading || processing || (type === "amendment" && (!originalInvoiceNumber.trim() || !originalInvoiceDate))}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
      >
        {uploading ? "Upload läuft …" : processing ? "Verarbeitung läuft …" : "Rechnung hochladen"}
      </button>
    </div>
  );
}
