import { NextResponse } from "next/server";
import { searchBusiness } from "@/lib/dataforseo";

export async function POST(req: Request) {
  const { q } = await req.json().catch(() => ({}));
  if (typeof q !== "string" || q.trim().length < 3) return NextResponse.json({ error: "Type the business name and city" }, { status: 400 });
  try {
    return NextResponse.json(await searchBusiness(q.trim()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 502 });
  }
}
