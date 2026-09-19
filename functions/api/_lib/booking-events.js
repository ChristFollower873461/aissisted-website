export class BookingEventValidationError extends Error {
  constructor(reason) { super(reason); this.name = 'BookingEventValidationError'; }
}

const fail = (reason) => { throw new BookingEventValidationError(reason); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)) || allowed.some((key) => !Object.hasOwn(value, key))) fail(`${label}_fields`);
}
function string(value, label, max = 200, allowEmpty = false) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > max || (!allowEmpty && !value)) fail(`${label}_invalid`);
}
function id(value, label, allowEmpty = false) {
  string(value, label, 200, allowEmpty);
  if (value && !/^[A-Za-z0-9_.:-]+$/.test(value)) fail(`${label}_invalid`);
}
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label}_invalid`);
}
function choice(value, allowed, label) { if (!allowed.includes(value)) fail(`${label}_invalid`); }
function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label}_invalid`);
}

export function canonicalBookingJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonicalBookingJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalBookingJson(value[key])}`).join(',')}}`;
  return fail('non_json_value');
}

export async function hashBookingEventPayload(envelope) {
  if (!object(envelope)) fail('envelope_invalid');
  const payload = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'payloadHash'));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalBookingJson(payload)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateBookingEvent(envelope) {
  keys(envelope, ['schemaVersion', 'source', 'sourceEnvironment', 'providerAccountId', 'livemode', 'bookingId', 'rootQualifiedSourceEventId', 'eventId', 'bookingRevision', 'eventType', 'observedAt', 'checkoutSessionId', 'paymentIntentId', 'chargeId', 'contract', 'snapshot', 'provenance', 'intake', 'payloadHash'], 'envelope');
  if (envelope.schemaVersion !== 1 || envelope.source !== 'aissisted-website') fail('schema_source_invalid');
  choice(envelope.sourceEnvironment, ['production', 'staging'], 'source_environment');
  id(envelope.providerAccountId, 'provider_account');
  if (!/^acct_[A-Za-z0-9]+$/.test(envelope.providerAccountId)) fail('provider_account_invalid');
  if (typeof envelope.livemode !== 'boolean') fail('livemode_invalid');
  for (const key of ['bookingId', 'rootQualifiedSourceEventId', 'eventId', 'checkoutSessionId']) id(envelope[key], key);
  if (envelope.rootQualifiedSourceEventId !== `website-booking-${envelope.bookingId}`) fail('root_identity_invalid');
  if (!/^cs_[A-Za-z0-9_]+$/.test(envelope.checkoutSessionId)) fail('session_id_invalid');
  for (const key of ['paymentIntentId', 'chargeId']) id(envelope[key], key, true);
  if (envelope.paymentIntentId && !/^pi_[A-Za-z0-9_]+$/.test(envelope.paymentIntentId)) fail('payment_intent_invalid');
  if (envelope.chargeId && !/^ch_[A-Za-z0-9_]+$/.test(envelope.chargeId)) fail('charge_invalid');
  integer(envelope.bookingRevision, 'booking_revision', 1);
  choice(envelope.eventType, ['booking.checkout_started', 'booking.payment_snapshot'], 'event_type');
  iso(envelope.observedAt, 'observed_at');
  keys(envelope.contract, ['releaseId', 'offerId', 'offerVersion', 'amountCents', 'currency', 'termsVersion', 'termsSha256'], 'contract');
  const contract = envelope.contract;
  for (const key of ['releaseId', 'offerId', 'termsVersion']) id(contract[key], key);
  integer(contract.offerVersion, 'offer_version', 1);
  integer(contract.amountCents, 'contract_amount', 1);
  if (!/^[a-z]{3}$/.test(contract.currency)) fail('currency_invalid');
  if (!/^[a-f0-9]{64}$/.test(contract.termsSha256)) fail('terms_hash_invalid');
  keys(envelope.snapshot, ['checkoutStatus', 'paymentStatus', 'paidAmountCents', 'succeededRefundAmountCents', 'refundStatus', 'bookingStatus'], 'snapshot');
  const snapshot = envelope.snapshot;
  choice(snapshot.checkoutStatus, ['open', 'complete', 'expired', 'unknown'], 'checkout_status');
  choice(snapshot.paymentStatus, ['unpaid', 'pending', 'paid', 'failed', 'expired', 'needs_review'], 'payment_status');
  choice(snapshot.refundStatus, ['none', 'pending', 'partial', 'full', 'needs_review'], 'refund_status');
  choice(snapshot.bookingStatus, ['hold', 'confirmed', 'manual_review', 'expired', 'payment_failed', 'canceled', 'unknown'], 'booking_status');
  integer(snapshot.paidAmountCents, 'paid_amount');
  integer(snapshot.succeededRefundAmountCents, 'refund_amount');
  if (snapshot.succeededRefundAmountCents > snapshot.paidAmountCents) fail('refund_exceeds_paid');
  if (snapshot.paymentStatus === 'paid' && snapshot.paidAmountCents !== contract.amountCents) fail('paid_contract_mismatch');
  if (!['paid', 'needs_review'].includes(snapshot.paymentStatus) && snapshot.paidAmountCents !== 0) fail('unpaid_amount_invalid');
  if (snapshot.refundStatus === 'full' && !(snapshot.paidAmountCents > 0 && snapshot.succeededRefundAmountCents === snapshot.paidAmountCents)) fail('full_refund_invalid');
  if (snapshot.refundStatus === 'partial' && !(snapshot.succeededRefundAmountCents > 0 && snapshot.succeededRefundAmountCents < snapshot.paidAmountCents)) fail('partial_refund_invalid');
  if (snapshot.refundStatus === 'none' && snapshot.succeededRefundAmountCents !== 0) fail('no_refund_invalid');
  keys(envelope.provenance, ['providerEventId', 'providerEventType', 'providerCreatedAt', 'verifiedAt'], 'provenance');
  id(envelope.provenance.providerEventId, 'provider_event_id', true);
  id(envelope.provenance.providerEventType, 'provider_event_type');
  integer(envelope.provenance.providerCreatedAt, 'provider_created_at');
  iso(envelope.provenance.verifiedAt, 'verified_at');
  if (envelope.eventType === 'booking.checkout_started') {
    if (!object(envelope.intake) || envelope.intake.qualifiedSourceEventId !== envelope.rootQualifiedSourceEventId || envelope.intake.inquiryType !== 'booking_request') fail('start_intake_invalid');
    const intakeKeys = ['name', 'email', 'phone', 'companyName', 'inquiryType', 'message', 'sourceUrl', 'sourceChannel', 'sourcePage', 'formName', 'campaignName', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'adPlatform', 'adCampaignId', 'adSetId', 'adId', 'gclid', 'fbclid', 'landingPage', 'firstSeenAt', 'qualificationStatus', 'qualifiedSourceEventId', 'consent', 'consentedAt', 'websiteLeaveBlank'];
    if (Object.entries(envelope.intake).some(([key, value]) => !intakeKeys.includes(key) || (key === 'consent' ? value !== true : typeof value !== 'string'))) fail('start_intake_fields');
    if (!['unpaid', 'pending'].includes(snapshot.paymentStatus) || snapshot.paidAmountCents || snapshot.succeededRefundAmountCents || snapshot.refundStatus !== 'none') fail('start_is_not_payment');
    if (envelope.provenance.providerEventId || envelope.provenance.providerEventType !== 'checkout.session.created') fail('start_provenance_invalid');
  } else {
    if (envelope.intake !== null) fail('snapshot_intake_must_be_null');
    if (!envelope.paymentIntentId && (snapshot.paidAmountCents || snapshot.succeededRefundAmountCents)) fail('paid_association_missing');
    if (!envelope.provenance.providerEventId && envelope.provenance.providerEventType !== 'provider.reconciled') fail('snapshot_provenance_invalid');
    choice(envelope.provenance.providerEventType, ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refunded', 'provider.reconciled'], 'provider_event_type');
  }
  if (!/^[a-f0-9]{64}$/.test(envelope.payloadHash)) fail('payload_hash_invalid');
  canonicalBookingJson(envelope);
  return envelope;
}

export async function sealBookingEvent(payload) {
  const envelope = { ...payload, payloadHash: await hashBookingEventPayload(payload) };
  return validateBookingEvent(envelope);
}

export async function verifyBookingEvent(envelope) {
  validateBookingEvent(envelope);
  if (await hashBookingEventPayload(envelope) !== envelope.payloadHash) fail('payload_hash_mismatch');
  return envelope;
}
