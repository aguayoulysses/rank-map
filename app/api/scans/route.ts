import { db, ensureSchema, finalizeScan, getBusiness, getScan } from "@/lib/db";
import { findRank, rankAt } from "@/lib/dataforseo";
import { buildGrid, type Shape } from "@/lib/grid";

export const maxDuration = 300;

const MAX_PINS = 200;
const MAX_KEYWORDS = 5;
const CONCURRENCY = 10;

interface Body {
  /** omit for a market research scan */
  businessId?: number;
  /** place name shown on market research scans */
  label?: string;
  keywords: string[];
  shape: Shape;
  layers: number;
  spacingMi: number;
  distanceLabel?: string;
  zoom: number;
  center: { lat: number; lng: number };
  skip?: number[]; // grid indices dropped as water
}

// Runs the scan and streams one NDJSON line per pin so the map fills in live.
// Pins are written as they land, so a closed tab still leaves a usable scan.
export async function POST(req: Request) {
  await ensureSchema();
  const b = (await req.json()) as Body;
  const market = !b.businessId;
  const business = market ? null : await getBusiness(Number(b.businessId));
  if (!market && !business) return Response.json({ error: "Business not found" }, { status: 404 });
  if (market && !b.label?.trim()) return Response.json({ error: "Name the area you're researching" }, { status: 400 });
  const keywords = [...new Set((b.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_KEYWORDS);
  if (!keywords.length) return Response.json({ error: "Add at least one keyword" }, { status: 400 });
  const shape: Shape = b.shape === "square" ? "square" : "circle";
  const layers = Math.min(7, Math.max(1, Math.round(b.layers)));
  const spacing = Math.min(10, Math.max(0.1, Number(b.spacingMi)));
  const zoom = Math.min(17, Math.max(10, Math.round(b.zoom)));
  const skip = new Set(b.skip ?? []);
  const points = buildGrid(b.center, shape, layers, spacing).filter((p) => !skip.has(p.i));
  if (!points.length || points.length > MAX_PINS) return Response.json({ error: `A scan can have 1 to ${MAX_PINS} pins` }, { status: 400 });

  if (business)
    await db().execute({
      sql: "UPDATE hx_businesses SET center_lat = ?, center_lng = ? WHERE id = ?",
      args: [b.center.lat, b.center.lng, business.id],
    });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* client went away; keep scanning and saving */
        }
      };
      for (const keyword of keywords) {
        const ins = await db().execute({
          sql: `INSERT INTO hx_scans (business_id, keyword, shape, layers, spacing_mi, distance_label, zoom, center_lat, center_lng, pin_count, mode, label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [business?.id ?? 0, keyword, shape, layers, spacing, b.distanceLabel ?? null, zoom, b.center.lat, b.center.lng, points.length, market ? "market" : "client", market ? b.label!.trim() : null],
        });
        const scanId = Number(ins.lastInsertRowid);
        send({ type: "scan", scan: await getScan(scanId) });
        let cost = 0;
        let failed = 0;
        const queue = [...points];
        await Promise.all(
          Array.from({ length: CONCURRENCY }, async () => {
            for (let p = queue.shift(); p; p = queue.shift()) {
              try {
                const r = await rankAt(keyword, p.lat, p.lng, zoom);
                cost += r.cost;
                const rank = business ? findRank(r.items, business) : null;
                await db().execute({
                  sql: "INSERT OR REPLACE INTO hx_pins (scan_id, idx, lat, lng, rank, items) VALUES (?, ?, ?, ?, ?, ?)",
                  args: [scanId, p.i, p.lat, p.lng, rank, JSON.stringify(r.items)],
                });
                send({ type: "pin", scanId, pin: { idx: p.i, lat: p.lat, lng: p.lng, rank, items: r.items } });
              } catch (e) {
                failed++;
                send({ type: "pinError", scanId, idx: p.i, message: e instanceof Error ? e.message : "failed" });
              }
            }
          })
        );
        const status = failed === points.length ? "failed" : "done";
        await finalizeScan(scanId, status, cost);
        send({ type: "done", scan: await getScan(scanId), failed });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
