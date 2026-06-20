import "dotenv/config";
import { getPrisma } from "@/lib/db/prisma";
import { prepareCourierMobileOfferFixture } from "./smoke-cash-order";

prepareCourierMobileOfferFixture()
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
