import PgBoss from "pg-boss";
import { registerDocxExtractionWorker } from "@/server/jobs/extract-docx";
import { registerOcrExtractionWorker } from "@/server/jobs/extract-ocr";
import { registerPdfTextExtractionWorker } from "@/server/jobs/extract-pdf-text";
import { registerFieldExtractionWorker } from "@/server/jobs/extract-fields";
import { registerZugferdGenerationWorker } from "@/server/jobs/generate-zugferd";

let bossPromise: Promise<PgBoss> | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        max: 5,
      });
      await boss.start();
      await registerPdfTextExtractionWorker(boss);
      await registerOcrExtractionWorker(boss);
      await registerDocxExtractionWorker(boss);
      await registerFieldExtractionWorker(boss);
      await registerZugferdGenerationWorker(boss);
      return boss;
    })();
  }
  return bossPromise;
}
