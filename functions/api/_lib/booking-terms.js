const WORKFLOW_MAP_V2_TERMS_VERSION =
  "workflow_map_build_discovery_225_terms_2026-09-02_v2";

const WORKFLOW_MAP_V2_RENDERED_TERMS = `AIssisted Consulting — Workflow Map & First-Build Plan Terms
Version: workflow_map_build_discovery_225_terms_2026-09-02_v2

1. What you purchase
The $225 fee purchases one 60-minute working session with AIssisted Consulting and one company-reviewed, one-page Workflow Map & First-Build Plan. The four promised plan outcomes are: (1) the problem or build goal; (2) the recommended direction and material known constraints; (3) the smallest useful first build; and (4) the next decision and validation needed before a reliable implementation quote.

2. Delivery
AIssisted will deliver the plan by 5:00 PM Eastern on the second qualifying business day following the completed session. A qualifying business day is Monday through Friday excluding these AIssisted-observed 2026 federal holiday dates: January 1, January 19, February 16, May 25, June 19, July 3, September 7, October 12, November 11, November 26, and December 25. The governing calendar is aissisted_us_federal_observed_2026_v1 and the governing timezone is America/New_York. A canceled session or no-show creates no delivery deadline.

3. Payment and confirmation
Release 1 accepts synchronous card payments, including card-wallet presentation supported by Stripe. A booking is confirmed only after Stripe reports the payment as paid. The $225 is payment for the session and plan; it is not a reservation deposit and creates no implementation credit. Implementation, production code or design, vendor setup, paid-access research, and ongoing support are separately scoped and priced.

4. Customer cancellation, rescheduling, and no-show
The customer may reschedule once with at least 24 hours' notice. If the customer cancels at least 24 hours before the session, the customer may choose a refund or reschedule. If the customer cancels inside 24 hours, the fee is non-refundable, although AIssisted Consulting may offer one discretionary reschedule. A customer no-show is non-refundable.

5. AIssisted cancellation and delivery remedy
If AIssisted cancels, the customer may choose a prompt reschedule or a full refund. After the session is completed and the plan is delivered on time, the fee is non-refundable. If AIssisted misses the delivery promise, the customer may choose a revised delivery date or a full refund. The customer keeps that refund choice even if work on the plan has begun.

6. Correction round
One correction round is included when requested within seven calendar days after delivery and limited to factual errors or material omissions relative to the accepted intake or session. A new direction, additional concept, substantive scope revision, or implementation work is not an included correction. A typo or narrow factual correction does not count as a substantive rewrite.

7. Plan-use rights
The plan is the customer's to keep, copy, share with the customer's team, and use when deciding what to build. AIssisted retains its pre-existing tools, templates, code, and general methods. Rights in later implementation work are governed by a separate implementation agreement.

8. Boundaries
The plan does not guarantee feasibility, implementation timeline, performance, privacy posture, savings, revenue, or implementation price. It may identify assumptions, unknowns, required access, and validation needed before commitment. Any monetary indication is order-of-magnitude only and is not a quote.`;

const TERMS_BY_RELEASE = Object.freeze({
  legacy_v1_2026_04_06: Object.freeze({
    schemaVersion: 1,
    releaseId: "legacy_v1_2026_04_06",
    policyVersion: "2026-04-06",
    policyHeading: "60 minutes. $225 deposit.",
    customerPolicyText:
      "This payment reserves your appointment window. If you move forward as a customer, the $225 is credited once toward service. If you do not move forward, the reservation payment is non-refundable.",
    customerAcceptanceText:
      "I understand this is a $225 non-refundable reservation deposit, credited once toward service if I become a customer."
  }),
  aissisted_booking_v2_2026_08_15: Object.freeze({
    schemaVersion: 1,
    releaseId: "aissisted_booking_v2_2026_08_15",
    offerId: "workflow_map_build_discovery_225",
    offerVersion: 2,
    termsVersion: WORKFLOW_MAP_V2_TERMS_VERSION,
    policyHeading: "Workflow Map & First-Build Plan — $225",
    customerAcceptanceText:
      "I agree to the Workflow Map & First-Build Plan terms, including the cancellation, delivery, correction, and plan-use rules.",
    renderedTerms: WORKFLOW_MAP_V2_RENDERED_TERMS
  })
});

export function getTermsSnapshotForRelease(releaseId) {
  const terms = TERMS_BY_RELEASE[String(releaseId || "").trim()];
  if (!terms) {
    throw new Error("No approved terms snapshot exists for the selected booking release.");
  }
  return terms;
}
