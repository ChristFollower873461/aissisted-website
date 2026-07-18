const PRIMARY_ORIGIN = "https://aissistedconsulting.com";

const BLOCKED_PREFIXES = [
  "/backups/",
  "/docs/",
  "/tests/",
  "/db/",
  "/migrations/",
  "/node_modules/"
];

const BLOCKED_PATHS = new Set([
  "/package.json",
  "/package-lock.json",
  "/README.md",
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

  if (hostname === "ocalaaiconsulting.com" || hostname === "www.ocalaaiconsulting.com") {
    return Response.redirect(`${PRIMARY_ORIGIN}${url.pathname}${url.search}`, 301);
  }

  if (hostname === "www.aissistedconsulting.com") {
    return Response.redirect(`${PRIMARY_ORIGIN}${url.pathname}${url.search}`, 301);
  }

  const redirectPath = REDIRECTS.get(url.pathname);
  if (redirectPath) {
    return Response.redirect(`${PRIMARY_ORIGIN}${redirectPath}${url.search}`, 301);
  }

  if (isBlockedPath(url.pathname)) {
    return notFound();
  }

  if (GONE_PATHS.has(url.pathname)) {
    return gone();
  }

  const response = await context.next();
  return mirrorAxonCookie(context.request, response);
}
