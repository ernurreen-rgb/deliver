import "dotenv/config";
import { getPrisma } from "@/lib/db/prisma";
import { prepareSmokeFixturesForRerun } from "./lib/smoke-fixture-reset";

prepareSmokeFixturesForRerun()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
