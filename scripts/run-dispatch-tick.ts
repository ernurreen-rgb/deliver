import "dotenv/config";
import { runDispatchTick } from "@/domains/delivery/dispatch-job";
import { getPrisma } from "@/lib/db/prisma";

async function main() {
  try {
    const summary = await runDispatchTick();
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } finally {
    await getPrisma().$disconnect();
  }
}

void main();
