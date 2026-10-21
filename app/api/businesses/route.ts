import { NextResponse } from "next/server";
import { db, ensureSchema, toBusiness, toScan } from "@/lib/db";

export async function GET() {
  await ensureSchema();
  const [b, s] = await Promise.all([
    db().execute("SELECT * FROM hx_businesses ORDER BY created_at DESC"),
    db().execute("SELECT * FROM hx_scans WHERE status != 'failed' ORDER BY created_at DESC"),
  ]);
  const scans = s.rows.map(toScan);
  return NextResponse.json({
    businesses: b.rows.map(toBusiness).map((biz) => {
      const mine = scans.filter((x) => x.businessId === biz.id);
      const latest = new Map<string, (typeof mine)[number]>();
      for (const x of mine) if (!latest.has(x.keyword)) latest.set(x.keyword, x);
      const avgs = [...latest.values()].map((x) => x.avgRank).filter((v): v is number => v != null);
      return {
        ...biz,
        keywords: latest.size,
        avgRank: avgs.length ? Math.round((avgs.reduce((a, v) => a + v, 0) / avgs.length) * 10) / 10 : null,
        lastScan: mine[0]?.createdAt ?? null,
      };
    }),
  });
}

export async function POST(req: Request) {
  await ensureSchema();
  const b = await req.json();
  if (!b?.name || typeof b.lat !== "number" || typeof b.lng !== "number") return NextResponse.json({ error: "Missing business details" }, { status: 400 });
  if (b.cid) {
    const dup = await db().execute({ sql: "SELECT id FROM hx_businesses WHERE cid = ?", args: [b.cid] });
    if (dup.rows[0]) return NextResponse.json({ id: Number(dup.rows[0].id) });
  }
  const r = await db().execute({
    sql: `INSERT INTO hx_businesses (name, address, category, rating, reviews, place_id, cid, lat, lng, center_lat, center_lng)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [b.name, b.address ?? null, b.category ?? null, b.rating ?? null, b.reviews ?? null, b.placeId ?? null, b.cid ?? null, b.lat, b.lng, b.lat, b.lng],
  });
  return NextResponse.json({ id: Number(r.lastInsertRowid) });
}
