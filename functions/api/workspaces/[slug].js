import {
  badRequest,
  json,
  methodNotAllowed,
  notFound,
  readJson,
  serverError,
  unauthorized
} from "../_lib/http.js";
import {
  findGrailWorkspaceByAccessCode,
  updateGrailWorkspace
} from "../_lib/grail-workspaces.js";

const REVIEW_WORKSPACE_CODES = new Set([
  "grail-review",
  "appstore-review",
  "app-store-review",
  "review"
]);

const reviewDrafts = [
  {
    channel: "google_business_profile",
    channel_label: "Google Business Profile",
    copy:
      "Review-only example: Grail turns approved service facts, source notes, and proof requests into a local update. If those anchors are missing, the update stays blocked.",
    source_url: "https://aissistedconsulting.com/grail/",
    schedule_slot_local: "Held for review",
    write_gate: "authority_not_active_for_channel",
    quality: {
      status: "pass",
      proof_lock: {
        status: "pass",
        substance_score: 100,
        anchor_count: 5,
        source_anchor_count: 4,
        matched_anchors: [
          { text: "review-only example" },
          { text: "approved service facts" },
          { text: "source notes" },
          { text: "proof requests" },
          { text: "blocked" }
        ],
        proof_gaps: []
      }
    }
  },
  {
    channel: "facebook",
    channel_label: "Facebook",
    copy:
      "Review-only example: Grail writes from business facts, reviews, offers, photos, FAQs, and approved channel rules instead of filling a calendar with vague AI posts.",
    source_url: "https://aissistedconsulting.com/grail/",
    schedule_slot_local: "Held for review",
    write_gate: "authority_not_active_for_channel",
    quality: {
      status: "pass",
      proof_lock: {
        status: "pass",
        substance_score: 100,
        anchor_count: 5,
        source_anchor_count: 5,
        matched_anchors: [
          { text: "business facts" },
          { text: "reviews" },
          { text: "offers" },
          { text: "photos" },
          { text: "approved channel rules" }
        ],
        proof_gaps: []
      }
    }
  },
  {
    channel: "website_seo",
    channel_label: "Website SEO",
    copy:
      "Review-only example: refresh the service page only when Grail has approved facts, customer-safe proof, and a clear authority gate. Otherwise the SEO task stays in proof needed.",
    source_url: "https://aissistedconsulting.com/grail/",
    schedule_slot_local: "Held for review",
    write_gate: "authority_not_active_for_channel",
    quality: {
      status: "pass",
      proof_lock: {
        status: "pass",
        substance_score: 100,
        anchor_count: 4,
        source_anchor_count: 4,
        matched_anchors: [
          { text: "approved facts" },
          { text: "customer-safe proof" },
          { text: "authority gate" },
          { text: "proof needed" }
        ],
        proof_gaps: []
      }
    }
  }
];

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function bearerWorkspaceCode(request) {
  const match = String(request.headers.get("authorization") || "").match(
    /^Bearer\s+(grl_[A-Za-z0-9_-]+)$/
  );
  return match ? match[1] : "";
}

export async function onRequestGet(context) {
  const slug = normalizeSlug(context.params.slug);

  if (!REVIEW_WORKSPACE_CODES.has(slug)) {
    if (slug !== "current") return notFound("Workspace route not found.");
    const accessCode = bearerWorkspaceCode(context.request);
    if (!accessCode) return unauthorized("A private Grail workspace code is required.");
    const workspace = await findGrailWorkspaceByAccessCode(context.env, accessCode);
    if (!workspace) {
      return notFound("No active Grail workspace was found for that code.");
    }
    return json({ status: "ok", snapshot: workspace.snapshot });
  }

  return json({
    status: "ok",
    snapshot: {
      customer: "Grail Review Workspace",
      plan: "Review-only workspace",
      price: "Sample data",
      status: "active",
      mode: "draft",
      run_at: new Date().toISOString(),
      drafts: reviewDrafts,
      writes: [],
      command_center: {
        draft_count: reviewDrafts.length,
        quality_pass_count: reviewDrafts.length,
        quality_fail_count: 0,
        connector_failure_count: 0,
        external_write_count: 0,
        drafts: reviewDrafts
      }
    }
  });
}

export async function onRequestPost(context) {
  const slug = normalizeSlug(context.params.slug);
  if (REVIEW_WORKSPACE_CODES.has(slug)) {
    return badRequest("The review workspace is read-only.");
  }
  if (slug !== "current") return notFound("Workspace route not found.");
  const accessCode = bearerWorkspaceCode(context.request);
  if (!accessCode) return unauthorized("A private Grail workspace code is required.");

  try {
    const payload = await readJson(context.request);
    const workspace = await updateGrailWorkspace({
      env: context.env,
      accessCode,
      action: String(payload.action || ""),
      input: payload.input && typeof payload.input === "object" ? payload.input : {}
    });
    if (!workspace) {
      return notFound("No active Grail workspace was found for that code.");
    }
    return json({ status: "ok", snapshot: workspace.snapshot });
  } catch (error) {
    if (error instanceof Error && /required|unsupported/i.test(error.message)) {
      return badRequest(error.message);
    }
    return serverError(error);
  }
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return methodNotAllowed(["GET", "POST"]);
}
