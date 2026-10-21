import { NextResponse } from "next/server";
import { balance } from "@/lib/dataforseo";

export async function GET() {
  return NextResponse.json({ balance: await balance() });
}
