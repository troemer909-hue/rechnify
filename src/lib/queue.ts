import PgBoss from "pg-boss";
import { registerPdfTextExtractionWorker } from "@/server/jobs/extract-pdf-text";

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
      return boss;
    })();
  }
  return bossPromise;
}
