import { readFile, writeFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../agent.json", import.meta.url), "utf8"));
source.version = "0.2";
source.site.intent = "Public website for AIssisted Consulting, an AI and software implementation company serving small businesses and individuals through workflow improvement and custom development. Booking and contact actions preserve human approval, exact terms, idempotency, audit, and Stripe-hosted payment boundaries.";
source.site.registryVersion = "2026-09-02.1";
source.site.registrySha256 = "3ca531e1a0fcf19268f6182e6510f965a9328738f1885dc3e197027874b19923";

const command = (id) => source.commands.find((entry) => entry.id === id);
const overview = command("get_site_overview");
overview.description = "Returns the public company message, small-business and individual paths, two service lanes, primary paid plan, privacy boundaries, and contact routes.";
overview.fallback.selectors.individualPath = "[data-agent='audience-individual']";
delete overview.fallback.selectors.familyPath;
overview.inputSchema.properties.topic.enum = ["overview", "small_business", "individual", "workflow_improvement", "custom_development", "services", "privacy", "booking", "contact"];
overview.outputSchema.properties.individualPath = { type: "string" };
delete overview.outputSchema.properties.familyPath;

const profile = command("get_business_profile");
profile.description = "Returns the approved AIssisted Consulting identity, audiences, two service lanes, offer boundary, location, and contact facts.";

const services = command("get_services");
services.description = "Returns the two active implementation lanes, the Workflow Map & First-Build Plan, the request-only Fit Call, and secondary Products & R&D boundary.";

const draftBusiness = command("draft_business_workflow_question");
const draftDevelopment = structuredClone(draftBusiness);
draftDevelopment.id = "draft_custom_development_question";
draftDevelopment.title = "Draft custom development question";
draftDevelopment.description = "Prepares a concrete custom software build question for human review without submitting it.";
if (draftDevelopment.inputSchema?.properties?.audience) {
  draftDevelopment.inputSchema.properties.audience.const = "custom_development";
}
const familyIndex = source.commands.findIndex((entry) => entry.id === "draft_family_ai_question");
if (!command(draftDevelopment.id)) source.commands.splice(familyIndex, 0, draftDevelopment);

const slots = command("get_booking_slots");
slots.description = "Returns the active booking release, offer, $225 session-and-plan fee, exact terms version and hash, route IDs, and open 60-minute appointment windows.";
slots.outputSchema.required = ["ok", "timezone", "reservationAmountCents", "currency", "policyVersion", "policySha256", "releaseId", "offerId", "offerVersion", "offerTitle", "implementationCreditEnabled", "intakeRouteIds", "slots"];
Object.assign(slots.outputSchema.properties, {
  policySha256: { type: "string" },
  releaseId: { type: "string" },
  offerId: { type: "string" },
  offerVersion: { type: "number" },
  offerTitle: { type: "string" },
  implementationCreditEnabled: { type: "boolean" },
  intakeRouteIds: { type: "array", items: { type: "string" } }
});

const contact = command("submit_contact_inquiry");
contact.inputSchema.properties.audience.enum = ["small_business_workflow", "custom_development", "individual_software_build", "family_ai_question", "privacy_and_control", "booking_or_consult", "other"];

const checkout = command("create_booking_checkout");
checkout.title = "Create paid plan checkout";
checkout.description = "Creates a user-approved hold and Stripe Checkout Session for the active Workflow Map & First-Build Plan. The site does not collect card details.";
checkout.inputSchema.required = ["slotId", "policyAccepted", "checkoutConsent", "confirmedAmountCents", "confirmedCurrency", "confirmedTermsVersion", "confirmedTermsSha256", "confirmedReleaseId", "confirmedOfferId", "confirmedOfferVersion", "contact", "intake"];
delete checkout.inputSchema.properties.confirmedReservationAmountCents;
delete checkout.inputSchema.properties.confirmedPolicyVersion;
Object.assign(checkout.inputSchema.properties, {
  confirmedAmountCents: { type: "number", const: 22500 },
  confirmedTermsVersion: { type: "string" },
  confirmedTermsSha256: { type: "string" },
  confirmedReleaseId: { type: "string", const: "aissisted_booking_v2_2026_08_15" },
  confirmedOfferId: { type: "string", const: "workflow_map_build_discovery_225" },
  confirmedOfferVersion: { type: "number", const: 2 }
});
checkout.inputSchema.properties.intake.required = ["routeId"];
checkout.inputSchema.properties.intake.properties.routeId = { type: "string", enum: ["workflow_improvement", "custom_development"] };
checkout.unauthenticatedJustification = "Public financial endpoint with same-origin checks, exact server-owned offer and terms confirmation, explicit human approval, idempotency, slot-conflict protection, audit records, and Stripe-hosted payment.";

source.safety.bookingPolicy = "The financial booking command requires human approval, the exact active release, offer, amount, currency, terms version and hash, an Idempotency-Key, audit logging, and Stripe Checkout. The $225 v2 fee is for the session and plan and creates no implementation credit.";
source.safety.familyGuidanceScope = "Personal and family AI guidance is a Contact route, separate from the paid implementation plan unless there is a concrete software build.";

const body = `${JSON.stringify(source, null, 2)}\n`;
await writeFile(new URL("../agent.json", import.meta.url), body, "utf8");
await writeFile(new URL("../.well-known/agent.json", import.meta.url), body, "utf8");
