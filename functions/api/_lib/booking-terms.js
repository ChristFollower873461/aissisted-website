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
    termsVersion: "workflow_map_build_discovery_225_terms_2026-08-15_v1",
    policyHeading: "Workflow Map & First-Build Plan — $225",
    customerAcceptanceText:
      "I agree to the Workflow Map & First-Build Plan terms, including the cancellation, delivery, correction, and plan-use rules.",
    renderedTerms:
      "AIssisted Consulting — Workflow Map & First-Build Plan Terms\nVersion: workflow_map_build_discovery_225_terms_2026-08-15_v1\n\n1. What you purchase\nThe $225 fee purchases one 60-minute founder-led working session with PJ Standley and one founder-reviewed, one-page Workflow Map & First-Build Plan. The four promised plan outcomes are: (1) the problem or build goal; (2) the recommended direction and material known constraints; (3) the smallest useful first build; and (4) the next decision and validation needed before a reliable implementation quote.\n\n2. Delivery\nAIssisted will deliver the plan by 5:00 PM Eastern on the second qualifying business day following the completed session. A qualifying business day is Monday through Friday excluding these AIssisted-observed 2026 federal holiday dates: January 1, January 19, February 16, May 25, June 19, July 3, September 7, October 12, November 11, November 26, and December 25. The governing calendar is aissisted_us_federal_observed_2026_v1 and the governing timezone is America/New_York. A canceled session or no-show creates no delivery deadline.\n\n3. Payment and confirmation\nRelease 1 accepts synchronous card payments, including card-wallet presentation supported by Stripe. A booking is confirmed only after Stripe reports the payment as paid. The $225 is payment for the session and plan; it is not a reservation deposit and creates no implementation credit. Implementation, production code or design, vendor setup, paid-access research, and ongoing support are separately scoped and priced.\n\n4. Customer cancellation, rescheduling, and no-show\nThe customer may reschedule once with at least 24 hours' notice. If the customer cancels at least 24 hours before the session, the customer may choose a refund or reschedule. If the customer cancels inside 24 hours, the fee is non-refundable, although PJ may offer one discretionary reschedule. A customer no-show is non-refundable.\n\n5. AIssisted cancellation and delivery remedy\nIf AIssisted cancels, the customer may choose a prompt reschedule or a full refund. After the session is completed and the plan is delivered on time, the fee is non-refundable. If AIssisted misses the delivery promise, the customer may choose a revised delivery date or a full refund. The customer keeps that refund choice even if work on the plan has begun.\n\n6. Correction round\nOne correction round is included when requested within seven calendar days after delivery and limited to factual errors or material omissions relative to the accepted intake or session. A new direction, additional concept, substantive scope revision, or implementation work is not an included correction. A typo or narrow factual correction does not count as a substantive rewrite.\n\n7. Plan-use rights\nThe plan is the customer's to keep, copy, share with the customer's team, and use when deciding what to build. AIssisted retains its pre-existing tools, templates, code, and general methods. Rights in later implementation work are governed by a separate implementation agreement.\n\n8. Boundaries\nThe plan does not guarantee feasibility, implementation timeline, performance, privacy posture, savings, revenue, or implementation price. It may identify assumptions, unknowns, required access, and validation needed before commitment. Any monetary indication is order-of-magnitude only and is not a quote."
  })
});

export function getTermsSnapshotForRelease(releaseId) {
  const terms = TERMS_BY_RELEASE[String(releaseId || "").trim()];
  if (!terms) {
    throw new Error("No approved terms snapshot exists for the selected booking release.");
  }
  return terms;
}
