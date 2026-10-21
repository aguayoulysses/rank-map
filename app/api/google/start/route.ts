import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authUrl } from "@/lib/google";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(`${origin}/api/google/callback`, state));
  res.cookies.set("hx_gstate", state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
  return res;
}
