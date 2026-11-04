import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, same, tokenFor } from "./lib/auth";

// Every page and API route sits behind the passcode. If PASSCODE is not set in
// production, nothing opens (fail closed).
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const passcode = process.env.PASSCODE;
  if (!passcode) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("PASSCODE is not set. Add it in the Vercel project settings.", { status: 503 });
  }

  const cookie = req.cookies.get(COOKIE)?.value || "";
  if (same(cookie, tokenFor(passcode))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
