import { getQueue } from "@/lib/queue";
import { extractOcr } from "./extract-ocr";

async function startWorker() {
  const boss = await getQueue();
  await boss.work("extract-ocr", { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      await extractOcr(job.data);
    }
  });

  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.info("OCR worker listening for extract-ocr jobs");
}

startWorker().catch((error: unknown) => {
  console.error("Could not start OCR worker", error);
  process.exit(1);
});
