# Book sale: Sell Them a Hammer

`/sell-them-a-hammer/` sells PJ Standley's book as a $29 one-time digital download:
PDF, EPUB and the toolkit zip (10 templates as Word and Markdown).

## Flow

1. The buy button POSTs `/api/store/checkout`. The function creates a Stripe Checkout
   Session (`mode=payment`, inline `price_data` 2900 usd, no pre-created Product or
   Price) with `metadata[store_product]=sell_them_a_hammer_digital_v1`. Success returns to
   `/sell-them-a-hammer/thanks/?session_id={CHECKOUT_SESSION_ID}`; cancel returns to the page.
2. The thanks page calls `GET /api/store/session?session_id=...`, which retrieves the
   Session from Stripe and lists the three files when it is paid.
3. Each link is `GET /api/store/download?session_id=...&file=pdf|epub|toolkit`. The function
   retrieves the Session again and requires all of: matching id, `status=complete`,
   `payment_status=paid`, our `store_product` metadata, `livemode` equal to
   `STRIPE_EXPECTED_LIVEMODE`, and Session creation within the last 30 days. It then
   streams the object from the private R2 binding with `Content-Disposition: attachment`.

Unknown or malformed sessions get 404, unpaid or wrong-product or expired sessions get
403, an unknown `file` value gets 400, and a missing binding or object gets 503. Each
error carries a plain message. `file` picks from a fixed map; it is never a path.

The `session_id` in the thanks URL is the buyer's access link for 30 days. The thanks
page loads no analytics or ad scripts and sends no referrer, so that URL stays on our site.

## Configuration

| Name | Where | Value |
| --- | --- | --- |
| `BOOK_FILES` | `wrangler.toml` `[[r2_buckets]]`, production only | bucket `aic-store-private` |
| `BOOK_SALE_ENABLED` | `wrangler.toml` vars | `"true"` production, `"false"` preview |
| `STRIPE_SECRET_KEY`, `STRIPE_EXPECTED_LIVEMODE`, `STRIPE_API_VERSION`, `PUBLIC_SITE_ORIGIN` | existing | unchanged |

Because `wrangler.toml` is the Pages configuration source, the R2 binding must live there;
bindings added in the dashboard are not used. `scripts/validate-pages-preview-isolation.mjs`
allows exactly this one reviewed R2 binding, on the main project's production slot only.
Preview deployments have no binding and no Stripe key, so checkout and downloads return 503 there.
Setting `BOOK_SALE_ENABLED` to anything but `"true"` closes new checkouts; existing buyers can
still download.

## Files in R2

| `file` | Object key | Source |
| --- | --- | --- |
| `pdf` | `sell-them-a-hammer/v1/Sell-Them-a-Hammer.pdf` | `ai-guy-book/output/Sell-Them-a-Hammer.pdf` |
| `epub` | `sell-them-a-hammer/v1/Sell-Them-a-Hammer.epub` | `ai-guy-book/output/Sell-Them-a-Hammer.epub` |
| `toolkit` | `sell-them-a-hammer/v1/Sell-Them-a-Hammer-Toolkit.zip` | `ai-guy-book/output/Sell-Them-a-Hammer-Toolkit.zip` (`build/toolkit_zip.py`) |

The files are never committed to this repository; the whole repository root is served as
static assets. To replace a file, upload a new object under the same key:

```bash
npx wrangler r2 object put "aic-store-private/sell-them-a-hammer/v1/Sell-Them-a-Hammer.pdf" \
  --file path/to/Sell-Them-a-Hammer.pdf --content-type application/pdf --remote
```

## Tests

`tests/book-store.test.mjs` covers checkout parameters, origin and kill-switch handling,
paid downloads, unpaid, wrong product, wrong mode, expiry, unknown and malformed sessions,
the file whitelist, missing storage, and the R2 isolation gate. Stripe is mocked through
`globalThis.fetch`, as in the booking tests.
