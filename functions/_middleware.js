const PRIMARY_ORIGIN = "https://aissistedconsulting.com";
const PREVIEW_COOKIE = "__Host-aic_preview";
const PREVIEW_SESSION_HOURS = 12;

const BLOCKED_PREFIXES = [
  "/backups/",
  "/docs/",
  "/tests/",
  "/db/",
  "/config/",
  "/scripts/",
  "/migrations/",
  "/node_modules/"
];

const BLOCKED_PATHS = new Set([
  "/package.json",
  "/package-lock.json",
  "/README.md",
  "/STATUS.md",
  "/DEPLOY-READY.md",
  "/DESIGN.md",
  "/wrangler.booking.example.toml",
  "/wrangler.toml"
]);

const GONE_PATHS = new Set([
  "/unrealtor",
  "/unrealtor/",
  "/unrealtor.html"
]);

const REDIRECTS = new Map([
  ["/grail", "/grail/"],
  ["/grail/index.html", "/grail/"],
  ["/grail/activation.html", "/grail/activation"],
  ["/grail/activation/", "/grail/activation"]
]);

const AXON_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const AXON_COOKIE_VALUE = /^[A-Za-z0-9_-]{1,256}$/;

function readCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const cookieName = part.slice(0, separator).trim();
    if (cookieName !== name) continue;

    return part.slice(separator + 1).trim();
  }

  return "";
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function previewHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function previewLoginPage({ invalid = false, label = "AIssisted Preview" } = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>${label}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:10vh auto;padding:2rem;color:#171522;background:#fbfaf7}form{display:grid;gap:1rem;padding:1.5rem;border:1px solid #ddd5c6;border-radius:16px;background:white}input,button{font:inherit;padding:.8rem;border-radius:9px;border:1px solid #b8ad99}button{cursor:pointer;background:#171522;color:white}.error{color:#9b1c1c}</style></head>
<body><main><h1>${label}</h1><p>This isolated test environment is access-controlled and is not the live AIssisted Consulting website.</p>
${invalid ? '<p class="error" role="alert">That preview access token was not accepted.</p>' : ""}
<form action="/__preview-auth" method="post"><label for="token">Preview access token</label><input id="token" name="token" type="password" autocomplete="off" required><button type="submit">Open preview</button></form>
</main></body></html>`;
}

async function enforcePreviewAccess(context, url) {
  const secret = String(context.env.PREVIEW_ACCESS_TOKEN || "");
  if (!secret) return null;

  // Stripe cannot carry the preview login cookie. This single machine endpoint
  // remains protected by the webhook handler's required Stripe signature.
  if (url.pathname === "/api/book/webhook" && context.request.method === "POST") {
    return null;
  }

  const expectedTokenHash = await sha256Hex(secret);
  const expectedSession = await sha256Hex(`aissisted-preview-session:${secret}`);
  const authorization = context.request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const authorizedByHeader = bearer
    ? constantTimeEqual(await sha256Hex(bearer), expectedTokenHash)
    : false;
  const authorizedByCookie = constantTimeEqual(
    readCookie(context.request, PREVIEW_COOKIE),
    expectedSession
  );

  if (url.pathname === "/__preview-auth" && context.request.method === "POST") {
    const form = await context.request.formData();
    const submitted = String(form.get("token") || "");
    const accepted = constantTimeEqual(await sha256Hex(submitted), expectedTokenHash);
    if (!accepted) {
      return previewHeaders(new Response(previewLoginPage({
        invalid: true,
        label: context.env.PREVIEW_ACCESS_LABEL
      }), { status: 401, headers: { "content-type": "text/html; charset=UTF-8" } }));
    }
    const response = new Response(null, {
      status: 303,
      headers: { location: `${url.origin}/` }
    });
    response.headers.append(
      "set-cookie",
      `${PREVIEW_COOKIE}=${expectedSession}; Max-Age=${PREVIEW_SESSION_HOURS * 60 * 60}; Path=/; HttpOnly; Secure; SameSite=Strict`
    );
    return previewHeaders(response);
  }

  if (!authorizedByHeader && !authorizedByCookie) {
    return previewHeaders(new Response(previewLoginPage({
      label: context.env.PREVIEW_ACCESS_LABEL
    }), { status: 401, headers: { "content-type": "text/html; charset=UTF-8" } }));
  }

  return null;
}

function mirrorAxonCookie(request, response) {
  const value = readCookie(request, "_axwrt");
  if (!AXON_COOKIE_VALUE.test(value)) return response;

  const headers = new Headers(response.headers);
  const expires = new Date(Date.now() + AXON_COOKIE_MAX_AGE_MS).toUTCString();
  headers.append(
    "set-cookie",
    `axwrt=${value}; Expires=${expires}; Domain=.aissistedconsulting.com; Path=/; SameSite=Lax; Secure`
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isBlockedPath(pathname) {
  if (pathname === "/docs/mcp" || pathname === "/docs/mcp/" || pathname === "/docs/mcp.html") {
    return false;
  }

  return BLOCKED_PATHS.has(pathname) || BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

function gone() {
  return new Response("Gone", {
    status: 410,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();
  const previewGate = await enforcePreviewAccess(context, url);
  if (previewGate) return previewGate;
  const primaryOrigin = context.env.PUBLIC_SITE_ORIGIN || PRIMARY_ORIGIN;

  if (hostname === "ocalaaiconsulting.com" || hostname === "www.ocalaaiconsulting.com") {
    return Response.redirect(`${primaryOrigin}${url.pathname}${url.search}`, 301);
  }

  if (hostname === "www.aissistedconsulting.com") {
    return Response.redirect(`${primaryOrigin}${url.pathname}${url.search}`, 301);
  }

  const redirectPath = REDIRECTS.get(url.pathname);
  if (redirectPath) {
    return Response.redirect(`${primaryOrigin}${redirectPath}${url.search}`, 301);
  }

  if (isBlockedPath(url.pathname)) {
    return notFound();
  }

  if (GONE_PATHS.has(url.pathname)) {
    return gone();
  }

  const response = await context.next();
  const finalResponse = mirrorAxonCookie(context.request, response);
  return context.env.PREVIEW_ACCESS_TOKEN ? previewHeaders(finalResponse) : finalResponse;
}
