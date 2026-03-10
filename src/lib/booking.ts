export const CANDIDATE_TIMES = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
] as const;

export const TYPE_LABELS = {
  interview: 'Job Interview',
  coffee: 'Coffee Chat',
  in_person: 'In-Person Event',
  ski_lesson: 'Ski Lesson',
} as const;

export const DURATIONS = {
  interview: 45,
  coffee: 30,
  in_person: 60,
  ski_lesson: 60,
} as const;

export type BookingType = keyof typeof TYPE_LABELS;

export function isBookingType(value: string): value is BookingType {
  return value in TYPE_LABELS;
}

export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTime(value: string): boolean {
  return (CANDIDATE_TIMES as readonly string[]).includes(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getHostTimeZone(): string {
  return process.env.HOST_TIMEZONE ?? 'America/Toronto';
}
