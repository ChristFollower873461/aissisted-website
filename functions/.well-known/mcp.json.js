// Discovery manifest for MCP-aware agents.
// Served at https://aissistedconsulting.com/.well-known/mcp.json

const MANIFEST = {
  name: "aissisted-consulting",
  version: "1.0.0",
  description:
    "AI consulting in Ocala, Florida. AI agents can discover services, check availability, and book a paid 60-minute consult ($225) with PJ Standley on behalf of their human. Free conversations and hardware purchases are handled through the website and direct contact, not through MCP.",
  provider: {
    name: "AIssisted Consulting",
    url: "https://aissistedconsulting.com",
    contact: "pj@aissistedconsulting.com"
  },
  endpoint: "https://aissistedconsulting.com/mcp",
  transport: "http",
  protocol: "mcp",
  protocolVersion: "2025-06-18",
  auth: {
    type: "none",
    public_tools: [
      "list_services",
      "check_availability",
      "get_quote",
      "get_business_info",
      "get_booking_status"
    ],
    human_approval_required: ["start_booking"],
    approval_flow: "stripe_checkout_url"
  },
  rate_limits: {
    read_tools: { requests_per_minute: 20, requests_per_hour: 300 },
    write_tools: { requests_per_minute: 5, requests_per_hour: 20 }
  },
  bookable_services: ["paid-consult"],
  tools: [
    "list_services",
    "check_availability",
    "get_quote",
    "start_booking",
    "get_booking_status",
    "get_business_info"
  ],
  documentation: "https://aissistedconsulting.com/docs/mcp"
};

export async function onRequest() {
  return new Response(JSON.stringify(MANIFEST, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*"
    }
  });
}
