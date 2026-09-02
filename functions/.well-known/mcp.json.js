// Discovery manifest for MCP-aware agents.
// Served at https://aissistedconsulting.com/.well-known/mcp.json

const MANIFEST = {
  name: "aissisted-consulting",
  version: "2.0.0",
  description:
    "AI and software implementation from AIssisted Consulting in Ocala, Florida. Agents can discover the two service lanes, published $225 plan, and availability. Humans accept exact terms and complete payment on the website.",
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
    human_approval_required: [],
    approval_flow: "website_booking_page"
  },
  rate_limits: {
    read_tools: { requests_per_minute: 20, requests_per_hour: 300 },
    write_tools: { requests_per_minute: 5, requests_per_hour: 20 }
  },
  bookable_services: [],
  tools: [
    "list_services",
    "check_availability",
    "get_quote",
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
