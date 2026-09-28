ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TABLE "MeetingType" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MeetingType" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'stripe';
ALTER TABLE "MeetingType" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "MeetingType" ADD COLUMN "promoDiscountCents" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Booking" ADD COLUMN "promoCodeApplied" TEXT;
