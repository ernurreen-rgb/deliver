-- CreateEnum
CREATE TYPE "CourierOfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "courier_offers" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "status" "CourierOfferStatus" NOT NULL DEFAULT 'pending',
    "sequence" INTEGER NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courier_offers_deliveryId_courierId_key" ON "courier_offers"("deliveryId", "courierId");

-- CreateIndex
CREATE INDEX "courier_offers_deliveryId_status_idx" ON "courier_offers"("deliveryId", "status");

-- CreateIndex
CREATE INDEX "courier_offers_courierId_status_idx" ON "courier_offers"("courierId", "status");

-- CreateIndex
CREATE INDEX "courier_offers_expiresAt_idx" ON "courier_offers"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "courier_offers_one_pending_per_delivery_idx" ON "courier_offers"("deliveryId") WHERE "status" = 'pending';

-- AddForeignKey
ALTER TABLE "courier_offers" ADD CONSTRAINT "courier_offers_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_offers" ADD CONSTRAINT "courier_offers_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
