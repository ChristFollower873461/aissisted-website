import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  findGrailWorkspaceByAccessCode,
  provisionGrailWorkspace,
  syncGrailWorkspaceSubscriptionStatus
} from "../functions/api/_lib/grail-workspaces.js";
import { onRequest as workspaceRoute } from "../functions/api/workspaces/[slug].js";
import { createTestD1 } from "./helpers/d1-sqlite.mjs";

const migrationPath = fileURLToPath(
  new URL("../migrations/0003_grail_workspaces.sql", import.meta.url)
);

function fixture(planOverrides = {}) {
  const d1 = createTestD1(migrationPath);
  const env = {
    BOOKING_DB: d1.binding,
    GRAIL_WORKSPACE_SIGNING_SECRET:
      "grail-workspace-test-secret-with-enough-entropy"
  };
  const session = {
    id: "cs_test_workspace_001",
    customer: "cus_test_workspace_001",
    subscription: "sub_test_workspace_001"
  };
  const plan = {
    plan: "local_agent",
    planName: "Grail Local Agent",
    ...planOverrides
  };
  const contact = {
    email: "owner@example.com",
    name: "Owner Name",
    company: "Owner Services"
  };
  return { d1, env, session, plan, contact };
}

async function callWorkspaceRoute({
  env,
  method = "GET",
  slug = "current",
  accessCode = "",
  body
}) {
  const headers = new Headers();
  if (accessCode) headers.set("authorization", `Bearer ${accessCode}`);
  if (body) headers.set("content-type", "application/json");
  const request = new Request(
    `https://aissistedconsulting.com/api/workspaces/${slug}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }
  );
  const response = await workspaceRoute({ request, env, params: { slug } });
  return { response, payload: await response.json() };
}

test("paid checkout provisions one private workspace without storing the access code", async () => {
  const { d1, env, session, plan, contact } = fixture();
  try {
    const created = await provisionGrailWorkspace({ env, session, plan, contact });
    const repeated = await provisionGrailWorkspace({ env, session, plan, contact });
    const stored = d1.database.prepare("SELECT * FROM grail_workspaces").get();

    assert.equal(created.ok, true);
    assert.equal(created.created, true);
    assert.match(created.accessCode, /^grl_[A-Za-z0-9_-]{30,}$/);
    assert.equal(repeated.created, false);
    assert.equal(repeated.accessCode, created.accessCode);
    assert.equal(
      d1.database.prepare("SELECT COUNT(*) AS count FROM grail_workspaces").get().count,
      1
    );
    assert.notEqual(stored.access_code_hash, created.accessCode);
    assert.equal(JSON.stringify(stored).includes(created.accessCode), false);
    assert.equal(JSON.parse(stored.state_json).customer, "Owner Services");
  } finally {
    d1.close();
  }
});

test("workspace API keeps the private code out of the URL and persists owner setup", async () => {
  const { d1, env, session, plan, contact } = fixture();
  try {
    const created = await provisionGrailWorkspace({ env, session, plan, contact });
    const missingAuth = await callWorkspaceRoute({ env });
    const leakedPath = await callWorkspaceRoute({ env, slug: created.accessCode });
    const opened = await callWorkspaceRoute({ env, accessCode: created.accessCode });
    const updated = await callWorkspaceRoute({
      env,
      method: "POST",
      accessCode: created.accessCode,
      body: {
        action: "add_source",
        input: {
          title: "Current services",
          detail: "Pool design and installation in Volusia County."
        }
      }
    });
    const reopened = await callWorkspaceRoute({ env, accessCode: created.accessCode });

    assert.equal(missingAuth.response.status, 401);
    assert.equal(leakedPath.response.status, 404);
    assert.equal(opened.response.status, 200);
    assert.equal(opened.payload.snapshot.customer, "Owner Services");
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.snapshot.proof_requests[0].state, "approved");
    assert.equal(reopened.payload.snapshot.proof_requests[0].title, "Current services");
  } finally {
    d1.close();
  }
});

test("subscription status suspends and restores dashboard access", async () => {
  const { d1, env, session, plan, contact } = fixture();
  try {
    const created = await provisionGrailWorkspace({ env, session, plan, contact });
    const suspended = await syncGrailWorkspaceSubscriptionStatus({
      env,
      subscriptionId: session.subscription,
      subscriptionStatus: "past_due"
    });

    assert.equal(suspended.status, "suspended");
    assert.equal(await findGrailWorkspaceByAccessCode(env, created.accessCode), null);

    const restored = await syncGrailWorkspaceSubscriptionStatus({
      env,
      subscriptionId: session.subscription,
      subscriptionStatus: "active"
    });
    const workspace = await findGrailWorkspaceByAccessCode(env, created.accessCode);

    assert.equal(restored.status, "active");
    assert.equal(workspace.snapshot.subscription_status, "active");
    assert.equal(workspace.snapshot.billing_notice, undefined);
  } finally {
    d1.close();
  }
});

test("workspace access reconciles live Stripe status without lifecycle webhooks", async () => {
  const { d1, env, session, plan, contact } = fixture();
  let stripeStatus = "past_due";
  env.STRIPE_SECRET_KEY = "sk_test_workspace_status";
  env.GRAIL_STRIPE_FETCH = async (url, options) => {
    assert.match(url, /\/v1\/subscriptions\/sub_test_workspace_001$/);
    assert.equal(options.headers.authorization, `Bearer ${env.STRIPE_SECRET_KEY}`);
    return Response.json({ id: session.subscription, status: stripeStatus });
  };

  try {
    const created = await provisionGrailWorkspace({ env, session, plan, contact });
    const suspended = await findGrailWorkspaceByAccessCode(env, created.accessCode);
    const suspendedRow = d1.database
      .prepare("SELECT status, state_json FROM grail_workspaces")
      .get();

    assert.equal(suspended, null);
    assert.equal(suspendedRow.status, "suspended");
    assert.equal(JSON.parse(suspendedRow.state_json).subscription_status, "past_due");

    stripeStatus = "active";
    const restored = await findGrailWorkspaceByAccessCode(env, created.accessCode);

    assert.equal(restored.status, "active");
    assert.equal(restored.snapshot.subscription_status, "active");
  } finally {
    d1.close();
  }
});

test("temporary Stripe status failures do not lock an active workspace", async () => {
  const { d1, env, session, plan, contact } = fixture();
  env.STRIPE_SECRET_KEY = "sk_test_workspace_status";
  env.GRAIL_STRIPE_FETCH = async () => new Response("Unavailable", { status: 503 });

  try {
    const created = await provisionGrailWorkspace({ env, session, plan, contact });
    const workspace = await findGrailWorkspaceByAccessCode(env, created.accessCode);

    assert.equal(workspace.status, "active");
    assert.equal(workspace.snapshot.customer, "Owner Services");
  } finally {
    d1.close();
  }
});

test("plan connectors match the three recurring tiers", async () => {
  const localFixture = fixture();
  const premiumFixture = fixture({ plan: "premium", planName: "Grail Premium" });
  try {
    const local = await provisionGrailWorkspace({
      env: localFixture.env,
      session: localFixture.session,
      plan: localFixture.plan,
      contact: localFixture.contact
    });
    const premium = await provisionGrailWorkspace({
      env: premiumFixture.env,
      session: premiumFixture.session,
      plan: premiumFixture.plan,
      contact: premiumFixture.contact
    });
    const localWorkspace = await findGrailWorkspaceByAccessCode(
      localFixture.env,
      local.accessCode
    );
    const premiumWorkspace = await findGrailWorkspaceByAccessCode(
      premiumFixture.env,
      premium.accessCode
    );

    assert.deepEqual(
      localWorkspace.snapshot.connectors.map((item) => item.id),
      ["gbp", "facebook"]
    );
    assert.deepEqual(
      premiumWorkspace.snapshot.connectors.map((item) => item.id),
      ["gbp", "facebook", "x", "seo", "additional"]
    );
  } finally {
    localFixture.d1.close();
    premiumFixture.d1.close();
  }
});

test("App Store review workspace stays public but read-only", async () => {
  const { d1, env } = fixture();
  try {
    const opened = await callWorkspaceRoute({ env, slug: "appstore-review" });
    const mutation = await callWorkspaceRoute({
      env,
      method: "POST",
      slug: "appstore-review",
      body: { action: "add_source", input: { title: "No", detail: "No" } }
    });

    assert.equal(opened.response.status, 200);
    assert.equal(opened.payload.snapshot.command_center.draft_count, 3);
    assert.equal(mutation.response.status, 400);
  } finally {
    d1.close();
  }
});
