import type { MapItem } from "./db";

// DataForSEO Google Maps SERP. Every call here is a paid request (~$0.002 at
// depth 20), so nothing in this app calls it on a timer: scans run only when
// someone presses Run scan.

const BASE = "https://api.dataforseo.com/v3";

function auth() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

interface RawItem {
  type?: string;
  rank_group?: number;
  title?: string;
  rating?: { value?: number; votes_count?: number };
  category?: string;
  address?: string;
  place_id?: string;
  cid?: string;
  latitude?: number;
  longitude?: number;
}

async function mapsCall(task: Record<string, unknown>): Promise<{ items: RawItem[]; cost: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 2500));
    try {
      const res = await fetch(`${BASE}/serp/google/maps/live/advanced`, {
        method: "POST",
        headers: { Authorization: auth(), "Content-Type": "application/json" },
        body: JSON.stringify([{ language_code: "en", ...task }]),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
      const data = await res.json();
      const t = data.tasks?.[0];
      const cost = Number(t?.cost ?? 0);
      if (t?.status_code === 40102) return { items: [], cost }; // no results at this point
      if (t?.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message ?? data.status_message}`);
      return { items: (t.result?.[0]?.items ?? []) as RawItem[], cost };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const toItem = (i: RawItem): MapItem => ({
  rank: i.rank_group as number,
  title: i.title as string,
  rating: i.rating?.value ?? null,
  reviews: i.rating?.votes_count ?? null,
  category: i.category ?? null,
  address: i.address ?? null,
  placeId: i.place_id ?? null,
  cid: i.cid ?? null,
  lat: typeof i.latitude === "number" ? i.latitude : null,
  lng: typeof i.longitude === "number" ? i.longitude : null,
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Target {
  name: string;
  placeId: string | null;
  cid: string | null;
}

/** Match by CID or place ID first; the business name is only a fallback. */
export function findRank(items: MapItem[], t: Target): number | null {
  const hit =
    items.find((i) => (t.cid && i.cid === t.cid) || (t.placeId && i.placeId === t.placeId)) ??
    items.find((i) => {
      const a = norm(i.title);
      const b = norm(t.name);
      return a === b || (a.length > 6 && b.includes(a)) || (b.length > 6 && a.includes(b));
    });
  return hit ? hit.rank : null;
}

export async function rankAt(keyword: string, lat: number, lng: number, zoom: number) {
  const { items, cost } = await mapsCall({ keyword, location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},${zoom}z`, depth: 20 });
  // Sponsored map ads come back with their own rank_group (1, 2) and are not rankings.
  return { items: items.filter((i) => i.type !== "maps_paid_item" && typeof i.rank_group === "number" && i.title).map(toItem), cost };
}

export interface BusinessHit extends MapItem {
  lat: number;
  lng: number;
}

/** Look a business up by name + city. One paid call. */
export async function searchBusiness(query: string, near?: { lat: number; lng: number }) {
  const { items, cost } = await mapsCall(
    near ? { keyword: query, location_coordinate: `${near.lat},${near.lng},11z`, depth: 10 } : { keyword: query, location_code: 2840, depth: 10 }
  );
  const hits: BusinessHit[] = items
    .filter((i) => i.title && typeof i.latitude === "number" && typeof i.longitude === "number")
    .map((i) => ({ ...toItem(i), rank: i.rank_group ?? 0, lat: i.latitude as number, lng: i.longitude as number }));
  return { hits, cost };
}

export async function balance(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/appendix/user_data`, { headers: { Authorization: auth() }, cache: "no-store" });
    const data = await res.json();
    return data.tasks?.[0]?.result?.[0]?.money?.balance ?? null;
  } catch {
    return null;
  }
}
