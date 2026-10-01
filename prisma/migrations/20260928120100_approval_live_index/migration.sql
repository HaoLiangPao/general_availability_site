DROP INDEX IF EXISTS "Booking_live_slot_key";
CREATE UNIQUE INDEX "Booking_live_slot_key" ON "Booking" ("hostId", "startTime", "endTime") WHERE "status" IN ('CONFIRMED', 'PENDING_PAYMENT', 'PENDING_APPROVAL');
