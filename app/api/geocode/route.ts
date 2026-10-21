import { NextResponse } from "next/server";

// Free address/city search (OpenStreetMap Nominatim) for picking a research area.
// Low volume, one request per search, identified per their usage policy.
export async function POST(req: Request) {
  const { q } = await req.json().catch(() => ({}));
  if (typeof q !== "string" || q.trim().length < 2) return NextResponse.json({ results: [] });
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: q.trim(), format: "jsonv2", limit: "6", addressdetails: "0", countrycodes: "us,ca" })}`;
  const r = await fetch(url, { headers: { "User-Agent": process.env.GEOCODE_USER_AGENT ?? "RankMap/1.0", "Accept-Language": "en" }, cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: "Place search is busy. Try again in a moment." }, { status: 502 });
  const d = (await r.json()) as { display_name: string; lat: string; lon: string; type: string }[];
  return NextResponse.json({
    results: d.map((x) => ({ label: x.display_name.replace(/, United States$/, ""), lat: Number(x.lat), lng: Number(x.lon), type: x.type })),
  });
}
