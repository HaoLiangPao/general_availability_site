# Design Log

| Feature ID | Date | Requirement Summary | Implementation Detail | Status | Commit Hash |
|---|---|---|---|---|---|
| FEAT-01 | 2026-03-06 | Add calendar view toggle, block weekends for interviews, add ski lesson with payment options, setup Stripe markdown | Calendar layout shift added in React, block weekends in API, ski_lesson event added, Stripe setup.md created | Completed | `39291cd` |
| FEAT-02 | 2026-03-06 | Add promo code, dynamic pricing, and E-transfer instructions for ski lesson | Add promo code input and compute price ($100 card, $90 e-transfer) in booking form. Update confirmation to show e-transfer email. | Completed | `a160169` |
| FEAT-03 | 2026-03-06 | Interview confirmation flow and UI updates for clients | Add host approval logic (link to confirm) for interviews. Email calendar invitation to patient only upon host approval. Update UI messaging to reflect "Pending Confirmation". | Completed | `6d2bf41` |
| FEAT-04 | 2026-03-06 | Admin filters, cancellations, and DB real-time sync | Added Ski Lesson filters to dashboard. Top stats act as clickable toggle filters. Added Gmail cancellation notification when admin deletes an event. Mapped internal database bookings directly to `api/availability` to completely prevent instant double-bookings regardless of Google Calendar delays. | Completed | `0b616fd` |
