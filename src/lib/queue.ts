import PgBoss from "pg-boss";

let bossInstance: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (!bossInstance) {
    bossInstance = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
    await bossInstance.start();
  }
  return bossInstance;
}
