/** Idempotent migration of the four legacy public offerings into OpenCalendar. */
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const everyDay = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), [
  { start: "09:00", end: "12:30" }, { start: "13:00", end: "15:30" },
]]));
const weekdays = { ...everyDay, "0": [], "6": [] };

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  if (!email) throw new Error("Set ADMIN_EMAIL before running seed:legacy.");
  const timezone = process.env.HOST_TIMEZONE?.trim() || "America/Toronto";
  let host = await prisma.host.findFirst({ orderBy: { createdAt: "asc" } });
  if (!host) host = await prisma.host.create({ data: {
    email, timezone, displayName: process.env.HOST_DISPLAY_NAME?.trim() || "Hao Liang",
    ...(process.env.BOOKKIT_CALENDAR?.trim() === "memory" ? { googleRefreshToken: "memory-calendar", googleConnectedAt: new Date() } : {}),
  } });
  const existingBrand = await prisma.brand.findFirst({ where: { hostId: host.id }, orderBy: { createdAt: "asc" } });
  const brand = existingBrand ?? await prisma.brand.create({ data: {
    hostId: host.id, slug: "hao", name: host.displayName || "Book Time With Me", tagline: "Choose a time to meet", accentColor: "#58a6ff",
  } });
  const transferEmail = process.env.ETRANSFER_RECIPIENT_EMAIL?.trim();
  if (transferEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(transferEmail)) throw new Error("ETRANSFER_RECIPIENT_EMAIL is not a valid email address.");
  const currency = process.env.LEGACY_CURRENCY?.trim().toLowerCase() || "usd";
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("LEGACY_CURRENCY must be a three-letter ISO currency code.");
  const entries: Prisma.MeetingTypeUncheckedCreateInput[] = [
    {
      hostId: host.id, brandId: brand.id, slug: "interview", name: "Job Interview",
      description: "For recruiters and hiring managers. Requests need host approval before an invitation is sent.",
      durationMinutes: 45, color: "#58a6ff", weeklyHours: weekdays, startIncrementMinutes: 30,
      minNoticeMinutes: 0, requiresApproval: true, allowGuests: false, position: 0,
      locations: [{ kind: "google_meet" }],
      confirmationNote: "Your interview has been approved.",
      policyText: "Your request holds this time while the host reviews it. Wait for a confirmation email before considering it final.",
    },
    {
      hostId: host.id, brandId: brand.id, slug: "coffee", name: "Coffee Chat",
      description: "A casual conversation to share ideas, network, or say hello.",
      durationMinutes: 30, color: "#a371f7", weeklyHours: everyDay, startIncrementMinutes: 30,
      minNoticeMinutes: 0, position: 1, locations: [{ kind: "google_meet" }],
    },
    {
      hostId: host.id, brandId: brand.id, slug: "in-person", name: "In-Person Event",
      description: "A face-to-face meeting for collaboration, workshops, or special occasions.",
      durationMinutes: 60, color: "#3fb950", weeklyHours: everyDay, startIncrementMinutes: 30,
      minNoticeMinutes: 0, position: 2,
      locations: [{ kind: "in_person", value: "Location to be arranged", label: "In person" }],
    },
    {
      hostId: host.id, brandId: brand.id, slug: "ski-lesson", name: "Ski Lesson · card",
      description: "One-hour ski lesson. Pay online by card ($100, or $90 with WINTER10).",
      durationMinutes: 60, color: "#00d2ff", weeklyHours: everyDay, startIncrementMinutes: 30,
      minNoticeMinutes: 0, position: 3, priceCents: 10000, currency,
      promoCode: "WINTER10", promoDiscountCents: 1000, paymentMethod: "stripe",
      locations: [{ kind: "in_person", value: "Ski area to be arranged", label: "On the slopes" }],
      active: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    },
    {
      hostId: host.id, brandId: brand.id, slug: "ski-lesson-etransfer", name: "Ski Lesson · e-transfer",
      description: "One-hour ski lesson. Pay by e-transfer ($90, or $80 with WINTER10). Payment is arranged after booking.",
      durationMinutes: 60, color: "#00d2ff", weeklyHours: everyDay, startIncrementMinutes: 30,
      minNoticeMinutes: 0, position: 4, priceCents: 9000, currency,
      promoCode: "WINTER10", promoDiscountCents: 1000, paymentMethod: "etransfer",
      locations: [{ kind: "in_person", value: "Ski area to be arranged", label: "On the slopes" }],
      active: Boolean(transferEmail),
      confirmationNote: transferEmail ? `Payment is due by e-transfer to ${transferEmail}. Please include your name in the transfer note.` : null,
      policyText: "The booking does not collect payment. The amount remains due until the host confirms receipt of your e-transfer.",
    },
  ];
  for (const entry of entries) {
    const existing = await prisma.meetingType.findUnique({ where: { slug: entry.slug } });
    if (existing) {
      if (existing.hostId !== host.id) throw new Error(`Slug ${entry.slug} belongs to another host.`);
      console.log(`kept existing /${entry.slug}`);
      continue;
    }
    await prisma.meetingType.create({ data: entry });
    console.log(`created /${entry.slug}${entry.active === false ? " (inactive until configured)" : ""}`);
  }
  console.log(`Brand page: /u/${brand.slug}. Connect Google Calendar before accepting real bookings.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
