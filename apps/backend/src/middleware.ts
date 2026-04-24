import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS middleware for all /api/* routes.
 *
 * The backend runs on :4000 and the frontend on :3000 (or a configured origin),
 * so every request crosses origins. We reflect the allowed origin so EventSource
 * (which requires matching Access-Control-Allow-Origin for credentialed reads)
 * works the same as fetch.
 */

function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? "http://localhost:3000";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? "*";

  // Preflight short-circuit — return 204 with the headers.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", allowOrigin);
  res.headers.set("Vary", "Origin");
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
