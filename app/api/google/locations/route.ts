import { NextResponse } from "next/server";
import { listLocations } from "@/lib/google";
import { db, ensureSchema } from "@/lib/db";

export async function GET(req: Request) {
  const conn = Number(new URL(req.url).searchParams.get("conn"));
  try {
    await ensureSchema();
    const [locations, existing] = await Promise.all([listLocations(conn), db().execute("SELECT id, gbp_location, place_id FROM hx_businesses")]);
    const byLoc = new Map(existing.rows.map((r) => [String(r.gbp_location ?? ""), Number(r.id)]));
    const byPlace = new Map(existing.rows.map((r) => [String(r.place_id ?? ""), Number(r.id)]));
    return NextResponse.json({
      locations: locations.map((l) => ({ ...l, businessId: byLoc.get(l.name) ?? (l.placeId ? byPlace.get(l.placeId) : undefined) ?? null })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load profiles" }, { status: 502 });
  }
}
