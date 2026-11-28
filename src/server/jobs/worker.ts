import { getQueue } from "@/lib/queue";

async function startWorker() {
  const boss = await getQueue();
  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.info("Invoice workers listening for jobs");
}

startWorker().catch((error: unknown) => {
  console.error("Could not start invoice workers", error);
  process.exit(1);
});
