import { NextResponse } from "next/server";
import { db, ensureSchema, getBusiness, toScan } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const business = await getBusiness(id);
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = await db().execute({ sql: "SELECT * FROM hx_scans WHERE business_id = ? ORDER BY created_at DESC, id DESC", args: [id] });
  return NextResponse.json({ business, scans: s.rows.map(toScan) });
}

/** Move the scan center (the hidden home base for service-area businesses). */
export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSchema();
  const id = Number((await params).id);
  const { centerLat, centerLng } = await req.json();
  if (typeof centerLat !== "number" || typeof centerLng !== "number") return NextResponse.json({ error: "Bad center" }, { status: 400 });
  await db().execute({ sql: "UPDATE hx_businesses SET center_lat = ?, center_lng = ? WHERE id = ?", args: [centerLat, centerLng, id] });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  await ensureSchema();
  const id = Number((await params).id);
  await db().batch(
    [
      { sql: "DELETE FROM hx_pins WHERE scan_id IN (SELECT id FROM hx_scans WHERE business_id = ?)", args: [id] },
      { sql: "DELETE FROM hx_scans WHERE business_id = ?", args: [id] },
      { sql: "DELETE FROM hx_businesses WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return NextResponse.json({ ok: true });
}
