import { GetObjectCommand } from "@aws-sdk/client-s3";
import type PgBoss from "pg-boss";
import mammoth from "mammoth";
import { DomUtils, parseDocument } from "htmlparser2";
import { db } from "@/lib/db";
import { getQueue } from "@/lib/queue";
import { S3_BUCKET, s3 } from "@/lib/s3";

const JOB_NAME = "extract-docx";

type ExtractDocxJob = {
  invoiceId: string;
  tenantId: string;
  originalFileKey: string;
  originalFileType: string;
};

type DocxTable = { rows: string[][] };

function extractTables(html: string): DocxTable[] {
  const document = parseDocument(html);
  const tables = DomUtils.findAll(
    (node) => node.type === "tag" && node.name === "table",
    document.children,
  );

  return tables.map((table) => {
    const rows: string[][] = [];
    const visitRows = (nodes: typeof table.children) => {
      for (const node of nodes) {
        if (node.type !== "tag") continue;
        if (node.name === "table") continue;
        if (node.name === "tr") {
          const cells: string[] = [];
          for (const child of node.children) {
            if (child.type === "tag" && (child.name === "td" || child.name === "th")) {
              cells.push(DomUtils.textContent(child).replace(/\s+/g, " ").trim());
            }
          }
          if (cells.length > 0) rows.push(cells);
        }
        visitRows(node.children);
      }
    };

    visitRows(table.children);
    return { rows };
  });
}

async function processDocx(job: ExtractDocxJob): Promise<void> {
  const { invoiceId, tenantId, originalFileKey } = job;
  if (!invoiceId || !tenantId || !originalFileKey || job.originalFileType !== "docx") {
    throw new Error("Invalid extract-docx job payload.");
  }

  try {
    await db.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: { status: "EXTRACTING" },
    });

    const file = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: originalFileKey }));
    if (!file.Body) throw new Error("The DOCX object has no body.");
    const buffer = Buffer.from(await file.Body.transformToByteArray());
    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);
    const rawText = textResult.value.trim();

    if (!rawText) {
      await db.invoice.updateMany({
        where: { id: invoiceId, tenantId },
        data: { status: "FAILED", extractedData: { rawText: "", tables: [] } },
      });
      return;
    }

    const extractedData = {
      rawText,
      tables: extractTables(htmlResult.value),
      previewHtml: htmlResult.value,
    };
    const saved = await db.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: { extractedData },
    });
    if (saved.count === 0) throw new Error("Invoice not found for extract-docx job.");

    const queue = await getQueue();
    const nextJobId = await queue.send("extract-fields", { invoiceId, tenantId });
    if (!nextJobId) throw new Error("The extract-fields job could not be queued.");
  } catch (error) {
    await db.invoice.updateMany({
      where: { id: invoiceId, tenantId },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

export async function registerDocxExtractionWorker(boss: PgBoss): Promise<string> {
  return boss.work<ExtractDocxJob>(JOB_NAME, async (jobs) => {
    for (const job of jobs) await processDocx(job.data);
  });
}
