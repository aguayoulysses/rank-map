import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveConnection } from "@/lib/google";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${url.origin}/settings?google=${q}`);
    res.cookies.delete("hx_gstate");
    return res;
  };
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== req.cookies.get("hx_gstate")?.value) return back("failed");
  try {
    const t = await exchangeCode(code, `${url.origin}/api/google/callback`);
    if (!t.refreshToken) return back("norefresh");
    await saveConnection(t.email ?? "Google account", t.refreshToken);
    return back("connected");
  } catch {
    return back("failed");
  }
}
