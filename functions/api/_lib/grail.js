export const GRAIL_PAYMENT_LINKS = Object.freeze({
  plink_1TnH36P3Zy09i3ccRpajeOKT: Object.freeze({
    plan: "local_agent",
    planName: "Grail Local Agent",
    monthlyPriceCents: 12900
  }),
  plink_1TnH37P3Zy09i3ccsUxHzWZD: Object.freeze({
    plan: "growth",
    planName: "Grail Growth",
    monthlyPriceCents: 19900
  }),
  plink_1TuZOKP3Zy09i3ccKKJklwAy: Object.freeze({
    plan: "premium",
    planName: "Grail Premium",
    monthlyPriceCents: 29900
  })
});

export function getGrailPaymentLinkPlan(session) {
  const paymentLinkId =
    typeof session?.payment_link === "string" ? session.payment_link : "";
  const knownPlan = GRAIL_PAYMENT_LINKS[paymentLinkId];

  if (!knownPlan) return null;
  return { ...knownPlan, paymentLinkId };
}
