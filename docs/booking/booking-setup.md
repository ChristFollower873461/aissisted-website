# Booking Setup

The paid booking flow is implemented with static pages under `/book/` and Cloudflare Pages Functions under `functions/api/book/`.

## Required for live Stripe checkout

- Bind a D1 database as `BOOKING_DB` and apply [`db/booking-schema.sql`](../../db/booking-schema.sql).
- Set `STRIPE_SECRET_KEY`.
- Set `STRIPE_WEBHOOK_SECRET`.
- Optionally set `STRIPE_BOOKING_PRICE_ID` if you want the deposit line item controlled from Stripe instead of inline price data.

## Required for Google Calendar-backed availability

- Set `GOOGLE_CALENDAR_ID`.
- Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- Set `GOOGLE_PRIVATE_KEY`.

If Google Calendar values are not present, the site falls back to the configured weekly availability template instead of hard-failing the public `/book` page.

## Required for paid bookings to land on Google Calendar

- Keep `BOOKING_CREATE_GOOGLE_CALENDAR_EVENT=true` or leave it unset, because event creation defaults on when Google Calendar credentials are configured.
- Set `GOOGLE_CALENDAR_SEND_UPDATES=all` if customers should receive the Google Calendar invite after Stripe confirms payment.
- Share the target Google Calendar with the service account email with permission to make changes to events.
- Mark networking blocks as **Free** in Google Calendar when paid consults are allowed to schedule over them. Busy events remain blocked automatically.

## Optional environment values

- `PUBLIC_SITE_ORIGIN`
- `BOOKING_TIMEZONE`
- `BOOKING_HOLD_MINUTES`
- `BOOKING_LOOKAHEAD_DAYS`
- `BOOKING_WEEKLY_AVAILABILITY_JSON`
- `BOOKING_RESERVATION_AMOUNT_CENTS`
- `BOOKING_CREATE_GOOGLE_CALENDAR_EVENT`
- `GOOGLE_CALENDAR_SEND_UPDATES`
- `BOOKING_NOTIFICATION_WEBHOOK_URL`
- `BOOKING_CONFIRMATION_WEBHOOK_URL`

Note: Stripe Checkout session expiry cannot be shorter than 30 minutes, so the effective hold/session window is clamped to at least 30 minutes.

## Endpoint summary

- `GET /api/book/availability`
- `POST /api/book/create-checkout`
- `GET /api/book/status`
- `POST /api/book/webhook`

## Business-rule behavior already represented

- Slots are held temporarily and only become confirmed after the Stripe webhook marks payment complete.
- Confirmed paid bookings create a Google Calendar event when Google Calendar credentials are configured.
- The reservation deposit is stored separately from later invoice credit application.
- Deposit credit records are created once per confirmed booking and can only be applied once later.
- If a paid session completes after the hold has gone stale or the slot conflicts, the booking is quarantined into manual review instead of being auto-confirmed incorrectly.
