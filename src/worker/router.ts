import type { Env } from "./index.js";
import { handlePixel } from "./handlers/pixel.js";
import { handleRedirect } from "./handlers/redirect.js";
import { handleHealth } from "./handlers/health.js";

export async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // GET /health
  if (segments.length === 1 && segments[0] === "health") {
    return handleHealth();
  }

  // GET /t/:trackingId
  if (segments.length === 2 && segments[0] === "t") {
    return await handlePixel(decodeURIComponent(segments[1]), request, env, ctx);
  }

  // GET /r/:linkId?url=... OR GET /r/:linkId (url embedded in signed token)
  if (segments.length === 2 && segments[0] === "r") {
    return await handleRedirect(decodeURIComponent(segments[1]), request, env, ctx);
  }

  return new Response("Not found", { status: 404 });
}
