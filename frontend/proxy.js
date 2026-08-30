import process from "node:process";

const API_PREFIX = "/api/";

/**
 * The header pair the API believes only when the key matches its own copy. Kept
 * in step with backend/src/middleware/clientIp.ts.
 */
const CLIENT_IP_HEADER = "x-cairn-client-ip";
const PROXY_KEY_HEADER = "x-cairn-proxy-key";

/**
 * The browser's own address, as this platform reports it to the function.
 *
 * Leftmost entry of `x-forwarded-for`: the edge appends, so the client is at the
 * head and every later entry is infrastructure. `x-real-ip` is the fallback for
 * a request that arrived without the chain.
 */
function clientAddress(request) {
  const chain = request.headers.get("x-forwarded-for");
  const first = chain?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || null;
}

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

  // Deleted before anything is set, and unconditionally. A browser can send
  // these two names itself, and forwarding a caller's own copy would let it
  // choose the address every per-IP rate limit is counted against. Only what
  // this function puts back may survive.
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(PROXY_KEY_HEADER);

  // Two hops reach the API through here, and the second one appends this
  // function's egress address — so without this the API attributes every request
  // on the platform to one IP and enforces every per-IP limit as a single shared
  // bucket. The key is what separates this claim from a forged one; absent it,
  // the claim is not made at all rather than made unprovably.
  const proxyKey = process.env.PROXY_SHARED_SECRET;
  const clientIp = clientAddress(request);
  if (proxyKey && clientIp) {
    headers.set(CLIENT_IP_HEADER, clientIp);
    headers.set(PROXY_KEY_HEADER, proxyKey);
  }

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    duplex: "half",
  });
}
