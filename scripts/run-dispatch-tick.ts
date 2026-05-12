import "dotenv/config";
import { runDispatchTick } from "../src/domains/delivery/dispatch-job";
import { getPrisma } from "../src/lib/db/prisma";

async function main() {
  try {
    const summary = await runDispatchTick();
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } finally {
    await getPrisma().$disconnect();
  }
}

void main();
