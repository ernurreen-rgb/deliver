ALTER TABLE "orders"
  ADD COLUMN "checkoutRequestKey" TEXT,
  ADD COLUMN "checkoutPayloadHash" TEXT;

CREATE UNIQUE INDEX "orders_checkoutRequestKey_key" ON "orders"("checkoutRequestKey");
