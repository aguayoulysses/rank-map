import { NextResponse } from "next/server";
import { db, ensureSchema, toScan } from "@/lib/db";

export async function GET() {
  await ensureSchema();
  const r = await db().execute("SELECT * FROM hx_scans WHERE mode = 'market' ORDER BY created_at DESC, id DESC");
  return NextResponse.json({ scans: r.rows.map(toScan) });
}
