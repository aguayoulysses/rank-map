import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, validSession } from "./lib/auth";

const PUBLIC = [/^\/login/, /^\/api\/login/, /^\/share\//, /^\/api\/share\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (await validSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"] };
