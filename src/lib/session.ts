import { unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";

export async function getSession() {
  noStore();
  const session = await auth();
  if (!session?.userId) return null;
  return session;
}
