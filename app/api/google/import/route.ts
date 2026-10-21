import { NextResponse } from "next/server";
import { listLocations } from "@/lib/google";
import { searchBusiness } from "@/lib/dataforseo";
import { db, ensureSchema } from "@/lib/db";

export const maxDuration = 120;

// Imports Business Profiles as businesses. Storefronts come in on their exact
// address. Service-area businesses hide theirs from the API, so they start on
// the spot Google Maps shows (one ~$0.002 lookup, which also brings the rating)
// and get flagged so the user drags the pin to the real home base.
export async function POST(req: Request) {
  await ensureSchema();
  const { conn, names } = (await req.json()) as { conn: number; names: string[] };
  const all = await listLocations(Number(conn));
  const pick = all.filter((l) => names.includes(l.name));
  const added: number[] = [];
  const problems: string[] = [];
  // look every profile up at once (each lookup takes ~15 s on DataForSEO's side)
  const found = await Promise.all(
    pick.map(async (l) => {
      try {
        const q = [l.title, l.serviceCities[0] ?? l.address?.split(",").slice(-2, -1)[0] ?? ""].join(" ").trim();
        const { hits } = await searchBusiness(q);
        return hits.find((h) => (l.placeId && h.placeId === l.placeId) || (l.cid && h.cid === l.cid)) ?? null;
      } catch {
        return null; // nice-to-have when Google gave us coordinates
      }
    })
  );
  for (const [i, l] of pick.entries()) {
    let lat = l.lat;
    let lng = l.lng;
    let rating: number | null = null;
    let reviews: number | null = null;
    let cid = l.cid;
    let address = l.address;
    const hit = found[i];
    if (hit) {
      rating = hit.rating;
      reviews = hit.reviews;
      cid ??= hit.cid;
      address ??= hit.address;
      if (lat == null || lng == null) {
        lat = hit.lat;
        lng = hit.lng;
      }
    }
    if (lat == null || lng == null) {
      problems.push(`${l.title}: not showing on Google Maps yet, so there's no spot to scan from.`);
      continue;
    }
    const dup = await db().execute({ sql: "SELECT id FROM hx_businesses WHERE gbp_location = ? OR (place_id IS NOT NULL AND place_id = ?)", args: [l.name, l.placeId] });
    if (dup.rows[0]) {
      const id = Number(dup.rows[0].id);
      await db().execute({
        sql: "UPDATE hx_businesses SET gbp_location = ?, service_cities = ?, service_area = ?, category = COALESCE(category, ?) WHERE id = ?",
        args: [l.name, JSON.stringify(l.serviceCities), l.serviceAreaBusiness ? 1 : 0, l.category, id],
      });
      added.push(id);
      continue;
    }
    const r = await db().execute({
      sql: `INSERT INTO hx_businesses (name, address, category, rating, reviews, place_id, cid, lat, lng, center_lat, center_lng, gbp_location, service_cities, service_area)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [l.title, address, l.category, rating, reviews, l.placeId, cid, lat, lng, lat, lng, l.name, JSON.stringify(l.serviceCities), l.serviceAreaBusiness ? 1 : 0],
    });
    added.push(Number(r.lastInsertRowid));
  }
  return NextResponse.json({ added, problems });
}
