"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfPreview({ url, thumbnail = false }: { url: string; thumbnail?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(0, Math.floor(entry.contentRect.width - 32)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="min-w-0">
      {error ? (
        <p className="p-6 text-sm text-destructive">Die PDF-Vorschau konnte nicht geladen werden.</p>
      ) : (
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
          onLoadError={() => setError(true)}
          loading={<p className="p-6 text-sm text-muted-foreground">PDF wird geladen…</p>}
          error={<p className="p-6 text-sm text-destructive">PDF konnte nicht geladen werden.</p>}
          className="grid justify-items-center gap-4 p-4"
        >
          {width > 0 && Array.from({ length: thumbnail ? Math.min(pageCount, 1) : pageCount }, (_, i) => (
            <Page
              key={i + 1}
              pageNumber={i + 1}
              width={thumbnail ? 100 : width}
              renderTextLayer={!thumbnail}
              renderAnnotationLayer={!thumbnail}
              className="overflow-hidden rounded border shadow-sm"
            />
          ))}
        </Document>
      )}
      {!thumbnail && pageCount > 0 && (
        <p className="pb-3 text-center text-xs text-muted-foreground">{pageCount} Seiten</p>
      )}
    </div>
  );
}
