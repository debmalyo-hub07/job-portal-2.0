import process from "node:process";

const API_PREFIX = "/api/";

function apiOrigin() {
  const raw = process.env.API_PROXY_ORIGIN;
  if (!raw) return null;

  try {
    const origin = new URL(raw);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    if (origin.pathname !== "/" || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
}

/**
 * Keeps browser-facing API traffic on the web origin. Mobile browsers block or
 * partition third-party cookies, so direct Vercel-to-Render requests cannot be
 * the transport for an httpOnly session.
 */
export default async function proxy(request) {
  const source = new URL(request.url);
  if (!source.pathname.startsWith(API_PREFIX)) return;

  const origin = apiOrigin();
  if (!origin) {
    return Response.json(
      { success: false, code: "API_PROXY_MISCONFIGURED", message: "Service unavailable." },
      { status: 503 },
    );
  }

  const target = new URL(`${source.pathname}${source.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    duplex: "half",
  });
}
