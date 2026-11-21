import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/_middleware.js";

test("operator watcher files are not public website assets", async () => {
  for (const path of ["/tools/website_lead_watch.py", "/tools/meta_lead_watch.py", "/tools/lead_watch_common.py"]) {
    let served = false;
    const response = await onRequest({
      request: new Request("https://aissistedconsulting.com" + path), env: {},
      next: async () => { served = true; return new Response("source"); }
    });
    assert.equal(response.status, 404);
    assert.equal(served, false);
  }
  const toolsPage = await onRequest({ request: new Request("https://aissistedconsulting.com/tools/"), env: {}, next: async () => new Response("unused") });
  assert.equal(toolsPage.status, 301);
  assert.equal(toolsPage.headers.get("location"), "https://aissistedconsulting.com/tools");
});
