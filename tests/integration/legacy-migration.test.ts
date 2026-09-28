import { describe, expect, test } from "vitest";
import { prisma } from "../../lib/db";
import { needsAttentionCount } from "../../lib/admin/needs-attention";
import { approveBooking, cancelBooking, createApprovalBooking, createFreeBooking, priceFor, SlotTakenError } from "../../lib/booking";
import { memoryCalendarControl } from "../../lib/calendar-memory";
import { parseBookingRequest } from "../../lib/booking-request";
import { bookingInput, createHost, createMeetingType, slotAt } from "../helpers/factories";

describe("legacy feature migration", () => {
  test("interview request holds the slot without an invite until host approval", async () => {
    const host = await createHost();
    const interview = await createMeetingType(host, { requiresApproval: true, durationMinutes: 45, startIncrementMinutes: 30 });
    const startTime = slotAt();
    const request = await createApprovalBooking(host, interview, bookingInput({ startTime }));
    expect(request.status).toBe("PENDING_APPROVAL");
    expect(request.expiresAt).toBeNull();
    expect(request.googleEventId).toBeNull();
    expect(memoryCalendarControl.eventCount()).toBe(0);
    expect(await needsAttentionCount()).toBe(1);
    await expect(createApprovalBooking(host, interview, bookingInput({ startTime, email: "other@example.test" }))).rejects.toBeInstanceOf(SlotTakenError);

    const approved = await approveBooking(request.id);
    expect(approved.status).toBe("CONFIRMED");
    expect(approved.googleEventId).toBeTruthy();
    expect(memoryCalendarControl.eventCount()).toBe(1);
    expect(await needsAttentionCount()).toBe(0);
    await expect(approveBooking(request.id)).rejects.toThrow("no longer awaiting confirmation");
  });

  test("declining a pending interview frees the held slot", async () => {
    const host = await createHost();
    const interview = await createMeetingType(host, { requiresApproval: true });
    const startTime = slotAt();
    const request = await createApprovalBooking(host, interview, bookingInput({ startTime }));
    const declined = await cancelBooking(request.id, "host", { reason: "Unavailable" });
    expect(declined.booking.status).toBe("CANCELLED");
    const next = await createApprovalBooking(host, interview, bookingInput({ startTime, email: "another@example.test" }));
    expect(next.status).toBe("PENDING_APPROVAL");
  });

  test("ski prices and promo are computed on the server; e-transfer remains unpaid", async () => {
    const host = await createHost();
    const ski = await createMeetingType(host, {
      priceCents: 9000, durationMinutes: 60, paymentMethod: "etransfer", promoCode: "WINTER10", promoDiscountCents: 1000,
    });
    const quote = priceFor(ski, 60, null, "WINTER10");
    expect(quote).toBe(8000);
    expect(priceFor(ski, 60)).toBe(9000);
    const bad = parseBookingRequest({ ...bookingInput(), startTime: slotAt().toISOString(), promoCode: "FAKE" }, ski, host);
    expect(bad).toMatchObject({ ok: false, code: "BAD_PROMO" });
    const booking = await createFreeBooking(host, ski, { ...bookingInput(), promoCode: "WINTER10" });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.amountCents).toBe(8000);
    expect(booking.paymentMethod).toBe("etransfer");
    expect(booking.stripePaymentStatus).toBe("unpaid");
    expect(booking.stripeSessionId).toBeNull();
    expect(await prisma.booking.count({ where: { promoCodeApplied: "WINTER10" } })).toBe(1);
  });
});
