import { createClient, type Client } from "@libsql/client";
import { market } from "./insights";

// Lives in a Turso (libSQL) database under hx_* tables. Tables are created on first use.

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function db(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL not set");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

export async function ensureSchema() {
  if (!ready) {
    ready = db()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS hx_businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            category TEXT,
            rating REAL,
            reviews INTEGER,
            place_id TEXT,
            cid TEXT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            center_lat REAL NOT NULL,
            center_lng REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
          `CREATE TABLE IF NOT EXISTS hx_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            shape TEXT NOT NULL,
            layers INTEGER NOT NULL,
            spacing_mi REAL NOT NULL,
            distance_label TEXT,
            zoom INTEGER NOT NULL,
            center_lat REAL NOT NULL,
            center_lng REAL NOT NULL,
            pin_count INTEGER NOT NULL,
            avg_rank REAL,
            found_avg REAL,
            top3_pct REAL,
            cost REAL NOT NULL DEFAULT 0,
            share_token TEXT UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            finished_at TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS hx_pins (
            scan_id INTEGER NOT NULL,
            idx INTEGER NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            rank INTEGER,
            items TEXT NOT NULL,
            PRIMARY KEY (scan_id, idx)
          )`,
          `CREATE INDEX IF NOT EXISTS hx_scans_business ON hx_scans(business_id, created_at)`,
          `CREATE TABLE IF NOT EXISTS hx_google (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            refresh_token TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
        ],
        "write"
      )
      .then(async () => {
        // columns added after launch; ALTER fails harmlessly once they exist
        for (const col of ["gbp_location TEXT", "service_cities TEXT", "service_area INTEGER"]) {
          await db().execute(`ALTER TABLE hx_businesses ADD COLUMN ${col}`).catch(() => {});
        }
        // market research scans have business_id 0, a mode and a place label
        for (const col of ["mode TEXT NOT NULL DEFAULT 'client'", "label TEXT", "score INTEGER"]) {
          await db().execute(`ALTER TABLE hx_scans ADD COLUMN ${col}`).catch(() => {});
        }
      })
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

export interface Business {
  id: number;
  name: string;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  placeId: string | null;
  cid: string | null;
  lat: number;
  lng: number;
  centerLat: number;
  centerLng: number;
  createdAt: string;
  /** set when imported from a connected Google Business Profile */
  gbpLocation: string | null;
  serviceCities: string[];
  serviceArea: boolean;
}

export interface MapItem {
  rank: number;
  title: string;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  address: string | null;
  placeId: string | null;
  cid: string | null;
  /** where the business sits; null for hidden-address businesses */
  lat?: number | null;
  lng?: number | null;
}

export interface Pin {
  idx: number;
  lat: number;
  lng: number;
  rank: number | null; // null = not in top 20
  items: MapItem[];
}

export interface Scan {
  id: number;
  businessId: number;
  keyword: string;
  status: "running" | "done" | "failed";
  shape: "circle" | "square";
  layers: number;
  spacingMi: number;
  distanceLabel: string | null;
  zoom: number;
  centerLat: number;
  centerLng: number;
  pinCount: number;
  avgRank: number | null;
  foundAvg: number | null;
  top3Pct: number | null;
  cost: number;
  shareToken: string | null;
  createdAt: string;
  finishedAt: string | null;
  mode: "client" | "market";
  /** place name for market research scans */
  label: string | null;
  /** market difficulty 0-100 (market research scans) */
  score: number | null;
}

type Row = Record<string, unknown>;

export const toBusiness = (r: Row): Business => ({
  id: Number(r.id),
  name: String(r.name),
  address: (r.address as string) ?? null,
  category: (r.category as string) ?? null,
  rating: r.rating == null ? null : Number(r.rating),
  reviews: r.reviews == null ? null : Number(r.reviews),
  placeId: (r.place_id as string) ?? null,
  cid: (r.cid as string) ?? null,
  lat: Number(r.lat),
  lng: Number(r.lng),
  centerLat: Number(r.center_lat),
  centerLng: Number(r.center_lng),
  createdAt: String(r.created_at),
  gbpLocation: (r.gbp_location as string) ?? null,
  serviceCities: r.service_cities ? JSON.parse(String(r.service_cities)) : [],
  serviceArea: Number(r.service_area ?? 0) === 1,
});

export const toScan = (r: Row): Scan => ({
  id: Number(r.id),
  businessId: Number(r.business_id),
  keyword: String(r.keyword),
  status: r.status as Scan["status"],
  shape: r.shape as Scan["shape"],
  layers: Number(r.layers),
  spacingMi: Number(r.spacing_mi),
  distanceLabel: (r.distance_label as string) ?? null,
  zoom: Number(r.zoom),
  centerLat: Number(r.center_lat),
  centerLng: Number(r.center_lng),
  pinCount: Number(r.pin_count),
  avgRank: r.avg_rank == null ? null : Number(r.avg_rank),
  foundAvg: r.found_avg == null ? null : Number(r.found_avg),
  top3Pct: r.top3_pct == null ? null : Number(r.top3_pct),
  cost: Number(r.cost ?? 0),
  shareToken: (r.share_token as string) ?? null,
  createdAt: String(r.created_at),
  finishedAt: (r.finished_at as string) ?? null,
  mode: r.mode === "market" ? "market" : "client",
  label: (r.label as string) ?? null,
  score: r.score == null ? null : Number(r.score),
});

export const toPin = (r: Row): Pin => ({
  idx: Number(r.idx),
  lat: Number(r.lat),
  lng: Number(r.lng),
  rank: r.rank == null ? null : Number(r.rank),
  items: JSON.parse(String(r.items)),
});

export async function getBusiness(id: number) {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM hx_businesses WHERE id = ?", args: [id] });
  return r.rows[0] ? toBusiness(r.rows[0]) : null;
}

export async function getScan(id: number) {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM hx_scans WHERE id = ?", args: [id] });
  return r.rows[0] ? toScan(r.rows[0]) : null;
}

export async function getPins(scanId: number) {
  const r = await db().execute({ sql: "SELECT * FROM hx_pins WHERE scan_id = ? ORDER BY idx", args: [scanId] });
  // Older scans stored sponsored ads too; organic results always carry a cid or place id.
  return r.rows.map(toPin).map((p) => ({ ...p, items: p.items.filter((i) => i.cid || i.placeId) }));
}

/** Recompute the summary numbers from stored pins. NR counts as 21 in the average. */
export async function finalizeScan(scanId: number, status: Scan["status"], cost: number) {
  const pins = await getPins(scanId);
  const ranks = pins.map((p) => p.rank ?? 21);
  const found = pins.filter((p) => p.rank != null).map((p) => p.rank as number);
  const avg = ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null;
  const foundAvg = found.length ? found.reduce((s, r) => s + r, 0) / found.length : null;
  const top3 = ranks.length ? (ranks.filter((r) => r <= 3).length / ranks.length) * 100 : null;
  const scan = await getScan(scanId);
  const score = pins.length ? market(pins, scan?.keyword ?? "").score : null;
  await db().execute({
    sql: `UPDATE hx_scans SET status = ?, avg_rank = ?, found_avg = ?, top3_pct = ?, cost = ?, score = ?, finished_at = datetime('now') WHERE id = ?`,
    args: [status, avg == null ? null : Math.round(avg * 10) / 10, foundAvg == null ? null : Math.round(foundAvg * 10) / 10, top3 == null ? null : Math.round(top3), Math.round(cost * 10000) / 10000, score, scanId],
  });
}
