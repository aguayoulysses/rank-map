import type { MapItem, Pin } from "./db";
import { haversineMi, type LatLng } from "./grid";

// Everything we can learn from the top-20 lists already stored on each pin.
// No extra API calls: competitor maps, difficulty and weak spots all come
// from data the scan already paid for.

export const keyOf = (i: Pick<MapItem, "cid" | "placeId" | "title">) => i.cid || i.placeId || i.title.toLowerCase();

export interface Competitor {
  key: string;
  title: string;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  /** average position over every pin, "not in top 20" counted as 21 */
  avg: number;
  /** average position on pins where they appear */
  arp: number | null;
  top3: number;
  /** share of pins in the top 3 (share of local voice) */
  solv: number;
  appears: number;
}

export function competitors(pins: Pin[]): Competitor[] {
  const n = pins.length || 1;
  const agg = new Map<string, { it: MapItem; sum: number; hits: number; top3: number }>();
  for (const p of pins)
    for (const it of p.items) {
      const k = keyOf(it);
      const a = agg.get(k) ?? { it, sum: 0, hits: 0, top3: 0 };
      a.sum += it.rank;
      a.hits++;
      if (it.rank <= 3) a.top3++;
      if ((it.reviews ?? 0) > (a.it.reviews ?? 0)) a.it = it; // keep the freshest-looking record
      agg.set(k, a);
    }
  return [...agg.entries()]
    .map(([key, a]) => ({
      key,
      title: a.it.title,
      category: a.it.category,
      rating: a.it.rating,
      reviews: a.it.reviews,
      avg: (a.sum + (n - a.hits) * 21) / n,
      arp: a.hits ? a.sum / a.hits : null,
      top3: a.top3,
      solv: a.top3 / n,
      appears: a.hits,
    }))
    .sort((x, y) => x.avg - y.avg);
}

/** rank of one business (by key) at a pin, null when outside the top 20 */
export function rankOf(pin: Pin, key: string): number | null {
  return pin.items.find((i) => keyOf(i) === key)?.rank ?? null;
}

/** Fewest reviews among the top 3 here: the review count you need to match to get into the map pack. */
export function barAt(pin: Pin): number | null {
  const top = pin.items.filter((i) => i.rank <= 3);
  if (top.length < 3) return top.length ? 0 : null; // fewer than 3 results = wide open
  return Math.min(...top.map((i) => i.reviews ?? 0));
}

export type Difficulty = "easy" | "moderate" | "hard" | "very hard";

export function difficultyOf(score: number | null): Difficulty {
  if (score == null || score < 30) return "easy";
  if (score < 55) return "moderate";
  if (score < 78) return "hard";
  return "very hard";
}

export const DIFFICULTY_COLOR: Record<Difficulty, string> = { easy: "#15803d", moderate: "#f5a524", hard: "#c42b30", "very hard": "#7f1d1d" };
export const DIFFICULTY_TEXT: Record<Difficulty, string> = { easy: "#fff", moderate: "#18181b", hard: "#fff", "very hard": "#fff" };

// ---- How hard it is to take a top-3 spot at one point ----
// Google ranks the map pack on relevance, distance and prominence. For each
// business holding a top-3 spot we score how hard it is to beat on all three:
//   relevance  does it match the search (primary category, then name)? An
//              off-target business (a restaurant for "taco catering") is easy
//              to push past, whatever its review count, so it scales the rest.
//   distance   how close it sits to the searcher. Google pulling businesses in
//              from miles away means there is no strong local option there.
//   reviews    review count on a log scale, plus the star rating.

const GENERIC = new Set(["near", "me", "best", "top", "local", "in", "the", "and", "for", "of", "a", "service", "services", "company", "companies", "contractor", "contractors", "business", "shop", "store", "center", "pro", "professional", "affordable", "cheap", "24", "hour", "emergency"]);

// Searches whose matching Google category shares no word with them.
const SYNONYMS: [RegExp, string[]][] = [
  [/\b(drain|sewer|water heater|leak|pipe|clog|toilet|faucet)/, ["plumber", "plumbing"]],
  [/\b(hvac|ac|a\/c|air condition|furnace|heating|heat pump|duct)/, ["hvac", "air", "heating", "conditioning"]],
  [/\b(lawn|yard|garden|tree|sod|sprinkler|irrigation|hardscape)/, ["landscaper", "landscaping", "landscape", "gardener", "lawn", "tree"]],
  [/\b(shingle|gutter|skylight)/, ["roofing", "roofer"]],
  [/\b(teeth|tooth|dental|implant|invisalign|braces|whitening)/, ["dentist", "dental", "orthodontist"]],
  [/\b(detail|ceramic coating|ppf|tint)/, ["detailing", "car", "auto"]],
  [/\b(maid|house clean|deep clean|janitor|move out)/, ["cleaning", "house", "janitorial", "cleaner"]],
  [/\b(outlet|panel|wiring|ev charger|lighting)/, ["electrician", "electrical"]],
  [/\b(chiro|back pain|adjustment)/, ["chiropractor"]],
  [/\b(botox|filler|facial|laser hair|med spa)/, ["medical", "spa", "skin"]],
  [/\b(party|wedding|event)/, ["caterer", "event", "party"]],
];

const stem = (w: string) => {
  let s = w.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  for (const suf of ["ing", "ers", "er", "ists", "ist", "ors", "or", "ion", "y", "e"])
    if (s.endsWith(suf) && s.length - suf.length >= 4) return s.slice(0, -suf.length);
  return s;
};
const words = (s: string | null | undefined) => (s ?? "").toLowerCase().split(/[^a-z0-9/]+/).filter(Boolean);

export interface SearchTerms {
  /** stems with weights; the last word (the service) counts double */
  terms: { stem: string; weight: number }[];
  /** extra category stems the search implies */
  implied: Set<string>;
}

export function searchTerms(keyword: string): SearchTerms {
  const ws = words(keyword).filter((w) => !GENERIC.has(w));
  const terms = ws.map((w, i) => ({ stem: stem(w), weight: i === ws.length - 1 ? 2 : 1 }));
  const implied = new Set<string>();
  for (const [re, cats] of SYNONYMS) if (re.test(keyword.toLowerCase())) cats.forEach((c) => implied.add(stem(c)));
  return { terms, implied };
}

/** 0 to 1: how well a business matches the search. Primary category counts fully, the name a bit less. */
export function relevance(t: SearchTerms, it: Pick<MapItem, "title" | "category">): number {
  const cat = new Set(words(it.category).map(stem));
  const name = new Set(words(it.title).map(stem));
  const total = t.terms.reduce((s, x) => s + x.weight, 0);
  if (!total) return 1;
  let hit = 0;
  for (const x of t.terms) hit += x.weight * (cat.has(x.stem) ? 1 : name.has(x.stem) ? 0.8 : 0);
  let r = hit / total;
  if ([...cat].some((c) => t.implied.has(c))) r = Math.max(r, 0.85);
  return Math.min(1, r);
}

/** 1 = right next to the searcher, 0 = 10+ miles away, null = no address (service-area business) */
export function closeness(mi: number | null): number | null {
  if (mi == null) return null;
  if (mi <= 0.5) return 1;
  return Math.max(0, 1 - Math.log(mi / 0.5) / Math.log(20));
}

export const reviewStrength = (reviews: number | null) => Math.min(1, Math.log10((reviews ?? 0) + 1) / Math.log10(301));
const ratingStrength = (rating: number | null) => (rating == null ? 0.5 : Math.max(0, Math.min(1, (rating - 3.5) / 1.3)));

export interface Holder {
  item: MapItem;
  relevance: number;
  /** miles from the point, null when the business hides its address */
  miles: number | null;
  /** 0 to 100: how hard this one business is to beat here */
  strength: number;
}

export function holderStrength(t: SearchTerms, pin: LatLng, it: MapItem): Holder {
  const rel = relevance(t, it);
  const miles = it.lat != null && it.lng != null ? haversineMi(pin, { lat: it.lat, lng: it.lng }) : null;
  const near = closeness(miles);
  const parts: [number, number][] = [[reviewStrength(it.reviews), 0.45], [ratingStrength(it.rating), 0.2]];
  if (near != null) parts.push([near, 0.35]);
  const w = parts.reduce((s, [, x]) => s + x, 0);
  const base = parts.reduce((s, [v, x]) => s + v * x, 0) / w;
  return { item: it, relevance: rel, miles, strength: Math.round(100 * base * (0.35 + 0.65 * rel)) };
}

export type Driver = "open" | "off-target" | "far" | "few-reviews" | "strong";

export interface PointDifficulty {
  /** 0 to 100 */
  score: number;
  difficulty: Difficulty;
  holders: Holder[];
  /** the top-3 business that is easiest to push out */
  weakest: Holder | null;
  /** what makes this spot easy or hard, for the one-line explanation */
  driver: Driver;
}

export function pointDifficulty(pin: Pin, t: SearchTerms): PointDifficulty {
  const holders = pin.items.filter((i) => i.rank <= 3).sort((a, b) => a.rank - b.rank).map((i) => holderStrength(t, pin, i));
  // an empty top-3 slot is free for the taking
  const s = [0, 1, 2].map((k) => holders[k]?.strength ?? 0);
  const score = Math.round(0.6 * Math.min(...s) + 0.4 * (s[0] + s[1] + s[2]) / 3);
  const weakest = holders.length ? holders.reduce((a, b) => (b.strength < a.strength ? b : a)) : null;
  let driver: Driver = "strong";
  if (holders.length < 3) driver = "open";
  else if (weakest) {
    const offTarget = weakest.relevance < 0.5;
    const far = weakest.miles != null && weakest.miles > 4;
    const few = (weakest.item.reviews ?? 0) < 15;
    driver = score >= 55 ? "strong" : offTarget ? "off-target" : few ? "few-reviews" : far ? "far" : "strong";
  }
  return { score, difficulty: difficultyOf(score), holders, weakest, driver };
}

const NATIONALITY = /^(mexican|italian|chinese|thai|japanese|american|korean|indian|vietnamese|greek|french|latin|salvadoran|peruvian|cuban)\b/i;
/** "Mexican restaurant" -> "a Mexican restaurant", "Restaurant" -> "a restaurant" */
const aKindOf = (category: string | null) => {
  if (!category) return "a different kind of business";
  const c = NATIONALITY.test(category) ? category : category[0].toLowerCase() + category.slice(1);
  return `${/^[aeiou]/i.test(c) ? "an" : "a"} ${c}`;
};
const reviewsText = (n: number | null) => (n ? `${n} review${n === 1 ? "" : "s"}` : "no reviews");

export function driverText(p: PointDifficulty): string {
  const w = p.weakest;
  if (p.driver === "open" || !w) return "Google shows fewer than 3 businesses here, so there is a free spot.";
  const who = `${w.item.title} (#${w.item.rank})`;
  switch (p.driver) {
    case "off-target":
      return `${who} is ${aKindOf(w.item.category)}, not a match for this search. A business that matches can push past it.`;
    case "few-reviews":
      return `${who} matches the search but has ${reviewsText(w.item.reviews)}.`;
    case "far":
      return `${who} is ${w.miles!.toFixed(1)} miles away. There is no strong option close by.`;
    default: {
      const close = p.holders.every((h) => h.miles != null && h.miles < 3);
      return `All 3 match the search${close ? ", sit close by" : ""} and have solid reviews. The easiest to beat is ${who} with ${reviewsText(w.item.reviews)}.`;
    }
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface MarketSummary {
  /** 0 to 100 */
  score: number;
  difficulty: Difficulty;
  /** median of the fewest reviews in the top 3 across the map */
  reviewsToTop3: number | null;
  /** median reviews of the #1 business */
  leaderReviews: number | null;
  avgTop3Rating: number | null;
  /** points that score easy */
  weakSpots: number;
  /** different businesses that hold a top-3 spot somewhere */
  top3Holders: number;
  /** top-3 share of the strongest business */
  leaderSolv: number;
  leader: Competitor | null;
  /** share of top-3 spots held by businesses that match the search */
  onTarget: number | null;
  /** median miles from a point to the businesses in its top 3 */
  typicalMiles: number | null;
  /** most common categories among top-3 spots, with their share */
  categories: { name: string; share: number }[];
  /** most common category among top-3 holders that do not match the search */
  offTargetCategory: string | null;
}

function topCategory(hs: Holder[]) {
  const n = new Map<string, number>();
  for (const h of hs) if (h.item.category) n.set(h.item.category, (n.get(h.item.category) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function market(pins: Pin[], keyword: string): MarketSummary {
  const t = searchTerms(keyword);
  const points = pins.map((p) => pointDifficulty(p, t));
  const bars = pins.map(barAt).filter((b): b is number => b != null);
  const firsts = pins.map((p) => p.items.find((i) => i.rank === 1)?.reviews).filter((v): v is number => v != null);
  const ratings = pins.flatMap((p) => p.items.filter((i) => i.rank <= 3 && i.rating != null).map((i) => i.rating as number));
  const holders = new Set(pins.flatMap((p) => p.items.filter((i) => i.rank <= 3).map(keyOf))).size;
  const comps = competitors(pins);
  const slots = points.flatMap((p) => p.holders);
  const miles = slots.map((h) => h.miles).filter((m): m is number => m != null);
  const cats = new Map<string, number>();
  for (const h of slots) cats.set(h.item.category ?? "No category", (cats.get(h.item.category ?? "No category") ?? 0) + 1);
  const leaderSolv = comps[0]?.solv ?? 0;
  const mid = median(points.map((p) => p.score)) ?? 0;
  // a business that owns most of the map adds up to 15
  const score = Math.round(Math.min(100, mid * 0.85 + leaderSolv * 15));
  const bar = median(bars);
  return {
    score,
    difficulty: difficultyOf(score),
    reviewsToTop3: bar == null ? null : Math.round(bar),
    leaderReviews: median(firsts),
    avgTop3Rating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    weakSpots: points.filter((p) => p.difficulty === "easy").length,
    top3Holders: holders,
    leaderSolv,
    leader: comps[0] ?? null,
    onTarget: slots.length ? slots.filter((h) => h.relevance >= 0.5).length / slots.length : null,
    typicalMiles: median(miles),
    offTargetCategory: topCategory(slots.filter((h) => h.relevance < 0.5)),
    categories: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, share: n / slots.length })),
  };
}

/** farthest distance from the center where this business still ranks top 3 */
export function solvDistance(pins: Pin[], center: LatLng, rank: (p: Pin) => number | null) {
  let far = 0;
  for (const p of pins) {
    const r = rank(p);
    if (r != null && r <= 3) far = Math.max(far, haversineMi(center, p));
  }
  return far;
}

/** the key a client business has inside a pin's results */
export function businessKey(b: { cid: string | null; placeId: string | null; name: string }) {
  return b.cid || b.placeId || b.name.toLowerCase();
}

/** two scans laid out on the same points, so pins can be compared one to one */
export function sameGrid(a: { shape: string; layers: number; spacingMi: number; centerLat: number; centerLng: number }, b: typeof a) {
  return a.shape === b.shape && a.layers === b.layers && Math.abs(a.spacingMi - b.spacingMi) < 0.001 && Math.abs(a.centerLat - b.centerLat) < 0.0005 && Math.abs(a.centerLng - b.centerLng) < 0.0005;
}

export function toCsv(pins: Pin[], keyword: string) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["keyword", "point", "lat", "lng", "position", "business", "rating", "reviews", "category"]];
  for (const p of pins) for (const it of p.items) rows.push([keyword, String(p.idx), p.lat.toFixed(6), p.lng.toFixed(6), String(it.rank), it.title, String(it.rating ?? ""), String(it.reviews ?? ""), it.category ?? ""]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
