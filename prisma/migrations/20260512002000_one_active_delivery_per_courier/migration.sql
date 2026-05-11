-- Keep a courier from being assigned to more than one active delivery.
CREATE UNIQUE INDEX "deliveries_one_active_per_courier_idx"
ON "deliveries"("courierId")
WHERE "courierId" IS NOT NULL
  AND "status" IN ('assigned', 'picked_up', 'delivering');
