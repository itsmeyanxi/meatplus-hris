import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * This app performs every mutation through the Laravel API — it does NOT use
 * Next.js Server Actions. External scanners repeatedly POST malformed Server-Action
 * requests (a `Next-Action` header carrying a bogus reference id), which crash the
 * Next runtime ("The Server Reference ID did not match the expected format") and
 * take the whole site down.
 *
 * Since no legitimate request ever carries `Next-Action` here, reject any that does
 * up front — before it reaches Next's action resolver — so these probes can't
 * knock the frontend over.
 */
export function middleware(req: NextRequest) {
  if (req.headers.has("next-action")) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Run on page routes only — skip static assets and the API paths that are
  // proxied straight to the backend.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|sanctum|up|iclock).*)"],
};
