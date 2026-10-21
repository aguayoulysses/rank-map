// Scan point layouts. Shared by the browser (preview + water check) and the
// server (validation). Pin counts: a circle with L layers has
// 3L² + 4L pins (7, 20, 39, 64, 95, 132, 175); a square has (2L+1)² pins.

export type Shape = "circle" | "square";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GridPoint extends LatLng {
  i: number;
  /** ring for circles, Chebyshev distance for squares; 0 = center */
  ring: number;
}

const MI_PER_DEG_LAT = 69;

export function offset(c: LatLng, northMi: number, eastMi: number): LatLng {
  return {
    lat: c.lat + northMi / MI_PER_DEG_LAT,
    lng: c.lng + eastMi / (MI_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180)),
  };
}

export function buildGrid(center: LatLng, shape: Shape, layers: number, spacingMi: number): GridPoint[] {
  const pts: GridPoint[] = [];
  const push = (p: LatLng, ring: number) => pts.push({ ...p, ring, i: pts.length });
  if (shape === "square") {
    for (let y = layers; y >= -layers; y--)
      for (let x = -layers; x <= layers; x++) push(offset(center, y * spacingMi, x * spacingMi), Math.max(Math.abs(x), Math.abs(y)));
    return pts;
  }
  push(center, 0);
  for (let k = 1; k <= layers; k++) {
    const n = k === 1 ? 6 : 6 * k + 1;
    const r = k * spacingMi;
    const start = k % 2 ? Math.PI / 2 : Math.PI / 2 + Math.PI / n; // stagger rings so pins don't line up in spokes
    for (let j = 0; j < n; j++) {
      const a = start + (2 * Math.PI * j) / n;
      push(offset(center, r * Math.sin(a), r * Math.cos(a)), k);
    }
  }
  return pts;
}

export function pinCount(shape: Shape, layers: number) {
  return shape === "square" ? (2 * layers + 1) ** 2 : 3 * layers * layers + 4 * layers;
}

/** Distance presets. Drive times are mapped to an approximate outer radius. */
export const DRIVE_PRESETS = [
  { id: "d15", label: "15-minute drive", radiusMi: 4 },
  { id: "d30", label: "30-minute drive", radiusMi: 8 },
  { id: "d45", label: "45-minute drive", radiusMi: 12 },
  { id: "d60", label: "60-minute drive", radiusMi: 16 },
] as const;

export const COST_PER_PIN = 0.002; // DataForSEO maps live/advanced at depth 20

export function haversineMi(a: LatLng, b: LatLng) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bucket(rank: number | null): "good" | "medium" | "bad" | "none" {
  if (rank == null || rank > 20) return "none";
  if (rank <= 3) return "good";
  if (rank <= 10) return "medium";
  return "bad";
}

// darker than the usual traffic-light hues so the white rank number on each pin stays readable (4.5:1+)
export const BUCKET_COLOR = { good: "#15803d", medium: "#f5a524", bad: "#c42b30", none: "#6b7280" } as const;
/** number color on top of each fill: amber gets dark ink so it stays readable */
export const BUCKET_TEXT = { good: "#ffffff", medium: "#18181b", bad: "#ffffff", none: "#ffffff" } as const;
/** same bands as text on a white panel */
export const BUCKET_INK = { good: "#15803d", medium: "#a15c00", bad: "#c42b30", none: "#52525b" } as const;

export const BUCKET_LABEL = { good: "Top 3", medium: "4 to 10", bad: "11 to 20", none: "Not in top 20" } as const;

/** outer edge of a scan, padded half a ring so the outer pins sit inside it */
export function scanRadiusMi(shape: Shape, layers: number, spacingMi: number) {
  return (shape === "square" ? layers * Math.SQRT2 : layers) * spacingMi + spacingMi * 0.55;
}

/** drop-in delay that ripples out from the center, ~0.9 s edge to edge */
export function rippleDelay(center: LatLng, p: LatLng, maxMi: number) {
  return Math.round((Math.min(1, haversineMi(center, p) / Math.max(0.1, maxMi)) * 900));
}
