import { normalizeEmail, sha256Hex } from "./transaction-safety.js";

const MAX_STATE_BYTES = 96 * 1024;

function cleanString(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function workspaceSecret(env) {
  return cleanString(env.GRAIL_WORKSPACE_SIGNING_SECRET || env.STRIPE_WEBHOOK_SECRET, 500);
}

async function deriveAccessCode(env, checkoutSessionId) {
  const secret = workspaceSecret(env);
  if (!secret || !checkoutSessionId) return "";

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`grail-workspace:${checkoutSessionId}`)
  );
  return `grl_${encodeBase64Url(new Uint8Array(signature).slice(0, 24))}`;
}

function connector(id, label, group, note) {
  return {
    id,
    label,
    group,
    state: "ready_to_connect",
    authority: "not_enabled",
    note
  };
}

function initialConnectors(plan) {
  const connectors = [
    connector(
      "gbp",
      "Google Business Profile",
      "Local search",
      "Connect the primary Google Business Profile during setup."
    ),
    connector(
      "facebook",
      "Facebook",
      "Social",
      "Connect the business Facebook page during setup."
    )
  ];

  if (plan === "growth" || plan === "premium") {
    connectors.push(
      connector(
        "x",
        "X",
        "Expanded social",
        "Connect X after the core business sources are approved."
      )
    );
  }

  if (plan === "premium") {
    connectors.push(
      connector(
        "seo",
        "Website SEO",
        "Owned web",
        "Add the live website and approved service pages as sources."
      ),
      connector(
        "additional",
        "Additional supported channel",
        "Expanded reach",
        "Choose one additional channel when access and proof are ready."
      )
    );
  }

  return connectors;
}

function initialSnapshot({ company, contactName, plan, planName, createdAt }) {
  return {
    customer: cleanString(company || contactName || "Your business", 120),
    plan: planName,
    price: "Active subscription",
    status: "active",
    mode: "setup",
    run_at: createdAt,
    market: "Your service area",
    promise: "Marketing work prepared from approved business sources",
    next_best_work:
      "Finish setup by adding the website, services, recent reviews, and customer-safe photos Grail may use.",
    drafts: [],
    writes: [],
    proof_requests: [
      {
        title: "Website and services",
        detail: "Add the live website and the services customers should find.",
        state: "needed"
      },
      {
        title: "Recent reviews",
        detail: "Add public review themes or approved review text.",
        state: "needed"
      },
      {
        title: "Customer-safe photos",
        detail: "Add approved job or service photos without private customer details.",
        state: "needed"
      },
      {
        title: "Current offer or priority",
        detail: "Add the offer, service, or location Grail should prioritize first.",
        state: "needed"
      }
    ],
    connectors: initialConnectors(plan),
    authority_rows: [
      { channel: "Drafting", mode: "Allowed from approved sources", allowed: true },
      { channel: "Scheduling", mode: "Owner approval required", allowed: false },
      { channel: "Publishing", mode: "Owner approval required", allowed: false },
      { channel: "Replies and messages", mode: "Human required", allowed: false },
      { channel: "Paid ads", mode: "Human required", allowed: false }
    ],
    owner_review_enabled: true,
    command_center: {
      draft_count: 0,
      quality_pass_count: 0,
      quality_fail_count: 0,
      connector_failure_count: 0,
      external_write_count: 0,
      drafts: []
    }
  };
}

function parseState(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function serializeState(state) {
  const serialized = JSON.stringify(state);
  if (new TextEncoder().encode(serialized).length > MAX_STATE_BYTES) {
    throw new Error("Grail workspace state is too large.");
  }
  return serialized;
}

async function logWorkspaceEvent(db, workspaceId, eventType, payload = {}) {
  await db
    .prepare(
      `INSERT INTO grail_workspace_events (id, workspace_id, event_type, payload_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(
      crypto.randomUUID(),
      workspaceId,
      cleanString(eventType, 120),
      JSON.stringify(payload),
      new Date().toISOString()
    )
    .run();
}

export async function provisionGrailWorkspace({ env, session, plan, contact }) {
  const db = env.BOOKING_DB;
  if (!db?.prepare) {
    return { ok: false, skipped: true, reason: "database_unavailable" };
  }

  const sessionId = cleanString(session.id, 160);
  const email = normalizeEmail(contact.email);
  const accessCode = await deriveAccessCode(env, sessionId);
  if (!sessionId || !email) {
    return { ok: false, skipped: true, reason: "checkout_identity_incomplete" };
  }
  if (!accessCode) {
    return { ok: false, skipped: true, reason: "workspace_signing_secret_missing" };
  }

  const accessCodeHash = await sha256Hex(accessCode);
  const existing = await db
    .prepare(
      `SELECT id, status, access_code_hash
       FROM grail_workspaces
       WHERE stripe_checkout_session_id = ?1
       LIMIT 1`
    )
    .bind(sessionId)
    .first();
  if (existing) {
    return {
      ok: true,
      created: false,
      workspaceId: existing.id,
      accessCode: existing.access_code_hash === accessCodeHash ? accessCode : "",
      reason: existing.access_code_hash === accessCodeHash ? "" : "signing_secret_changed"
    };
  }

  const createdAt = new Date().toISOString();
  const workspaceId = crypto.randomUUID();
  const state = initialSnapshot({
    company: contact.company,
    contactName: contact.name,
    plan: plan.plan,
    planName: plan.planName,
    createdAt
  });

  await db
    .prepare(
      `INSERT INTO grail_workspaces (
         id, access_code_hash, access_code_hint, customer_email_normalized,
         customer_name, company, plan, plan_name, status, state_json,
         stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
         created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10, ?11, ?12, ?13, ?13)`
    )
    .bind(
      workspaceId,
      accessCodeHash,
      accessCode.slice(-6),
      email,
      cleanString(contact.name, 120),
      cleanString(contact.company, 120),
      cleanString(plan.plan, 80),
      cleanString(plan.planName, 120),
      serializeState(state),
      typeof session.customer === "string" ? session.customer : "",
      typeof session.subscription === "string" ? session.subscription : "",
      sessionId,
      createdAt
    )
    .run();

  await logWorkspaceEvent(db, workspaceId, "workspace.provisioned", { plan: plan.plan });
  return { ok: true, created: true, workspaceId, accessCode };
}

export async function findGrailWorkspaceByAccessCode(env, accessCode) {
  const db = env.BOOKING_DB;
  const normalized = cleanString(accessCode, 200);
  if (!db?.prepare || !normalized.startsWith("grl_")) return null;

  const accessCodeHash = await sha256Hex(normalized);
  let row = await db
    .prepare(
      `SELECT id, status, state_json, stripe_subscription_id
       FROM grail_workspaces
       WHERE access_code_hash = ?1
       LIMIT 1`
    )
    .bind(accessCodeHash)
    .first();
  if (!row) return null;

  const reconciliation = await reconcileGrailWorkspaceSubscription({ env, row });
  if (reconciliation.ok) {
    row = {
      ...row,
      status: reconciliation.status,
      state_json: serializeState(reconciliation.snapshot)
    };
  }
  if (row.status !== "active") return null;

  const openedAt = new Date().toISOString();
  await db
    .prepare("UPDATE grail_workspaces SET last_opened_at = ?1 WHERE id = ?2")
    .bind(openedAt, row.id)
    .run();
  return { id: row.id, status: row.status, snapshot: parseState(row.state_json) };
}

async function fetchStripeSubscription(env, subscriptionId) {
  const stripeSecret = cleanString(env.STRIPE_SECRET_KEY, 500);
  const normalizedSubscriptionId = cleanString(subscriptionId, 160);
  if (!stripeSecret || !normalizedSubscriptionId) {
    return { ok: false, skipped: true, reason: "stripe_configuration_unavailable" };
  }

  const stripeFetch =
    typeof env.GRAIL_STRIPE_FETCH === "function" ? env.GRAIL_STRIPE_FETCH : fetch;
  try {
    const response = await stripeFetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(normalizedSubscriptionId)}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${stripeSecret}` },
        cache: "no-store"
      }
    );
    if (!response.ok) {
      return { ok: false, skipped: true, reason: `stripe_status_${response.status}` };
    }
    const subscription = await response.json();
    const status = cleanString(subscription?.status, 80).toLowerCase();
    if (!status) {
      return { ok: false, skipped: true, reason: "stripe_status_missing" };
    }
    return { ok: true, status };
  } catch {
    return { ok: false, skipped: true, reason: "stripe_status_unreachable" };
  }
}

async function reconcileGrailWorkspaceSubscription({ env, row }) {
  const subscription = await fetchStripeSubscription(env, row.stripe_subscription_id);
  if (!subscription.ok) return subscription;
  return syncGrailWorkspaceSubscriptionStatus({
    env,
    subscriptionId: row.stripe_subscription_id,
    subscriptionStatus: subscription.status
  });
}

export async function syncGrailWorkspaceSubscriptionStatus({
  env,
  subscriptionId,
  subscriptionStatus
}) {
  const db = env.BOOKING_DB;
  const normalizedSubscriptionId = cleanString(subscriptionId, 160);
  const normalizedSubscriptionStatus = cleanString(subscriptionStatus, 80).toLowerCase();
  if (!db?.prepare || !normalizedSubscriptionId) {
    return {
      ok: false,
      skipped: true,
      reason: "database_or_subscription_unavailable"
    };
  }

  const row = await db
    .prepare(
      `SELECT id, status, state_json
       FROM grail_workspaces
       WHERE stripe_subscription_id = ?1
       LIMIT 1`
    )
    .bind(normalizedSubscriptionId)
    .first();
  if (!row) return { ok: false, skipped: true, reason: "workspace_not_found" };

  const active =
    normalizedSubscriptionStatus === "active" ||
    normalizedSubscriptionStatus === "trialing";
  const workspaceStatus = active
    ? "active"
    : normalizedSubscriptionStatus === "canceled"
      ? "canceled"
      : "suspended";
  const state = parseState(row.state_json);
  state.status = workspaceStatus;
  state.subscription_status = normalizedSubscriptionStatus || "unknown";
  if (active) {
    delete state.billing_notice;
  } else {
    state.billing_notice =
      "Subscription access needs attention before Grail can continue operating this workspace.";
  }
  state.updated_at = new Date().toISOString();

  if (
    row.status === workspaceStatus &&
    parseState(row.state_json).subscription_status === normalizedSubscriptionStatus
  ) {
    return {
      ok: true,
      workspaceId: row.id,
      status: workspaceStatus,
      snapshot: parseState(row.state_json),
      changed: false
    };
  }

  await db
    .prepare(
      `UPDATE grail_workspaces
       SET status = ?1, state_json = ?2, updated_at = ?3
       WHERE id = ?4`
    )
    .bind(workspaceStatus, serializeState(state), state.updated_at, row.id)
    .run();
  await logWorkspaceEvent(db, row.id, "workspace.subscription_status_changed", {
    subscriptionStatus: normalizedSubscriptionStatus,
    workspaceStatus
  });
  return {
    ok: true,
    workspaceId: row.id,
    status: workspaceStatus,
    snapshot: state,
    changed: true
  };
}

function requiredDraftAnchors(draft) {
  return Array.isArray(draft?.required_anchors)
    ? draft.required_anchors.map((value) => cleanString(value, 500)).filter(Boolean)
    : [];
}

function updateDraftState(draft, copy) {
  const nextCopy = cleanString(copy, 5000);
  const requiredAnchors = requiredDraftAnchors(draft);
  const normalizedCopy = nextCopy.toLocaleLowerCase();
  const matched = requiredAnchors.filter((anchor) =>
    normalizedCopy.includes(anchor.toLocaleLowerCase())
  );
  const gaps = requiredAnchors.filter(
    (anchor) => !normalizedCopy.includes(anchor.toLocaleLowerCase())
  );
  return {
    ...draft,
    copy: nextCopy,
    owner_review_status: "not_requested",
    quality: {
      ...(draft.quality || {}),
      status: gaps.length ? "fail" : "pass",
      proof_lock: {
        ...(draft.quality?.proof_lock || {}),
        status: gaps.length ? "fail" : "pass",
        substance_score: requiredAnchors.length
          ? Math.round((matched.length / requiredAnchors.length) * 100)
          : 100,
        anchor_count: matched.length,
        matched_anchors: matched.map((text) => ({ text })),
        proof_gaps: gaps
      }
    }
  };
}

export async function updateGrailWorkspace({ env, accessCode, action, input }) {
  const db = env.BOOKING_DB;
  const workspace = await findGrailWorkspaceByAccessCode(env, accessCode);
  if (!db?.prepare || !workspace) return null;

  const state = workspace.snapshot;
  if (action === "add_source") {
    const title = cleanString(input.title, 140);
    const detail = cleanString(input.detail, 2000);
    if (!title || !detail) throw new Error("Source title and detail are required.");
    state.proof_requests = [
      { title, detail, state: "approved" },
      ...(Array.isArray(state.proof_requests) ? state.proof_requests : []).filter(
        (item) =>
          cleanString(item?.title, 140).toLocaleLowerCase() !== title.toLocaleLowerCase()
      )
    ].slice(0, 100);
  } else if (action === "set_approval_queue") {
    state.owner_review_enabled = input.enabled === true;
  } else if (action === "approve_draft") {
    const draftId = cleanString(input.draftId, 160);
    state.drafts = (Array.isArray(state.drafts) ? state.drafts : []).map((draft) =>
      cleanString(draft.id || draft.channel, 160) === draftId &&
      draft.quality?.proof_lock?.status === "pass"
        ? { ...draft, owner_review_status: "queued", write_gate: "owner_review_queued" }
        : draft
    );
  } else if (action === "update_draft") {
    const draftId = cleanString(input.draftId, 160);
    state.drafts = (Array.isArray(state.drafts) ? state.drafts : []).map((draft) =>
      cleanString(draft.id || draft.channel, 160) === draftId
        ? updateDraftState(draft, input.copy)
        : draft
    );
  } else {
    throw new Error("Unsupported Grail workspace action.");
  }

  state.updated_at = new Date().toISOString();
  if (state.command_center) state.command_center.drafts = state.drafts || [];
  await db
    .prepare("UPDATE grail_workspaces SET state_json = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(serializeState(state), state.updated_at, workspace.id)
    .run();
  await logWorkspaceEvent(db, workspace.id, `workspace.${action}`, { action });
  return { id: workspace.id, status: "active", snapshot: state };
}
