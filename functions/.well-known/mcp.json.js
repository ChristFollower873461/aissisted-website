// Discovery manifest for MCP-aware agents.
// Served at https://aissistedconsulting.com/.well-known/mcp.json

const MANIFEST = {
  name: "aissisted-consulting",
  version: "1.0.0",
  description:
    "AI consulting, local-AI hardware deployment, and monthly service by AIssisted Consulting in Ocala, Florida. AI agents can discover services, check availability, and initiate bookings on behalf of their humans.",
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
    approval_flow: "stripe_checkout_url_for_paid_services"
  },
  rate_limits: {
    read_tools: { requests_per_minute: 20, requests_per_hour: 300 },
    write_tools: { requests_per_minute: 5, requests_per_hour: 20 },
    free_booking: {
      per_email_per_24h: 1,
      per_ip_per_24h: 3
    }
  },
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
