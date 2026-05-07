const PRIMARY_ORIGIN = "https://aissistedconsulting.com";

const BLOCKED_PREFIXES = [
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

function isBlockedPath(pathname) {
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

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  if (hostname === "ocalaaiconsulting.com" || hostname === "www.ocalaaiconsulting.com") {
    return Response.redirect(`${PRIMARY_ORIGIN}${url.pathname}${url.search}`, 301);
  }

  if (hostname === "www.aissistedconsulting.com") {
    return Response.redirect(`${PRIMARY_ORIGIN}${url.pathname}${url.search}`, 301);
  }

  if (isBlockedPath(url.pathname)) {
    return notFound();
  }

  return context.next();
}
