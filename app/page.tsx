"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MapView, { type MapPin } from "@/components/MapView";
import { RankChip, Stars, TopBar, fmtDate } from "@/components/ui";
import type { Business } from "@/lib/db";
import type { BusinessHit } from "@/lib/dataforseo";

type Row = Business & { keywords: number; avgRank: number | null; lastScan: string | null };

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BusinessHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  const loadRows = () =>
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((d) => setRows(d.businesses ?? []))
      .catch(() => setRows([]));
  useEffect(() => {
    loadRows();
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setHits(null);
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "The search didn't work. Try again.");
    setHits(d.hits);
    if (!d.hits.length) setErr("Nothing came back. Add the city after the name, like “Joe’s Plumbing Denver”.");
  }

  async function add(h: BusinessHit) {
    setBusy(true);
    const r = await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...h, name: h.title }) });
    const d = await r.json();
    if (d.id) router.push(`/b/${d.id}`);
    else {
      setBusy(false);
      setErr(d.error ?? "Could not add the business");
    }
  }

  const pins: MapPin[] = useMemo(() => {
    if (hits?.length) return hits.map((h, i) => ({ key: `h${i}`, lat: h.lat, lng: h.lng, state: "place", label: String(i + 1) }));
    return (rows ?? []).map((b) => ({ key: `b${b.id}`, lat: b.lat, lng: b.lng, state: "place", label: b.name.length > 22 ? b.name.slice(0, 20) + "…" : b.name }));
  }, [rows, hits]);
  const fitKey = pins.map((p) => p.key).join(",");

  return (
    <main className="relative h-full">
      <MapView pins={pins} fitKey={fitKey} selected={hover} onPinClick={(k) => k.startsWith("b") && router.push(`/b/${k.slice(1)}`)} padding={{ top: 100, bottom: 60, left: 520, right: 60 }} />
      <TopBar />
      <div className="absolute z-10 top-[76px] left-3 right-3 sm:right-auto sm:left-4 sm:w-[470px] bottom-3 flex flex-col gap-3 overflow-y-auto scroll-thin pointer-events-none">
        <section className="panel p-5 pointer-events-auto">
          <h1 className="text-[24px] font-extrabold tracking-tight">Businesses</h1>
          <p className="help mt-1 text-[14px]">Scan your own profiles from Google, or look up any business, even a competitor.</p>

          <form onSubmit={search} className="mt-4 flex flex-col gap-2">
            <label htmlFor="biz-search" className="label">Look up any business</label>
            <div className="flex gap-2">
              <input id="biz-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business name and city" className="field flex-1 min-w-0 px-3.5 text-[15px]" />
              <button className="btn btn-primary" disabled={busy || q.trim().length < 3}>
                {busy && !hits ? "Searching…" : "Search"}
              </button>
            </div>
            <p className="help">{busy && !hits ? "Asking Google. This takes about 15 seconds." : "Type the name the way it appears on Google, plus the city."}</p>
          </form>
          {err && <p role="alert" className="text-medium text-[14px] font-semibold mt-2">{err}</p>}
          {hits && hits.length > 0 && (
            <div className="mt-3">
              <p className="label mb-2">Is it one of these?</p>
              <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto scroll-thin">
                {hits.map((h, i) => (
                  <li key={h.cid ?? i}>
                    <button
                      onClick={() => add(h)}
                      onMouseEnter={() => setHover(`h${i}`)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(`h${i}`)}
                      disabled={busy}
                      className="w-full text-left rounded-xl border-[1.5px] border-line-strong hover:border-ink hover:bg-soft px-3.5 py-3 flex gap-3 items-center"
                    >
                      <span className="h-7 w-7 shrink-0 rounded-full bg-ink text-white grid place-items-center text-[13px] font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-[15px] truncate">{h.title}</span>
                        <span className="block text-[13px] text-muted truncate">{h.address ?? h.category}</span>
                        <Stars rating={h.rating} reviews={h.reviews} />
                      </span>
                      <span className="btn btn-primary !min-h-9 !px-3 text-[14px]">Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <Link href="/settings#google" className="panel pointer-events-auto flex items-center gap-3 px-5 py-4 hover:bg-soft">
          <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-[15px]">Import from Google Business Profile</span>
            <span className="block help">Bring in every profile your Google account manages</span>
          </span>
          <span aria-hidden className="text-muted text-[20px]">›</span>
        </Link>

        <section className="panel pointer-events-auto" aria-label="Saved businesses">
          <h2 className="px-5 pt-4 pb-2 text-[16px] font-extrabold tracking-tight">Saved</h2>
          <ul>
            {rows == null && <li className="px-5 pb-4 help">Loading…</li>}
            {rows?.length === 0 && <li className="px-5 pb-5 help">Nothing saved yet. Search for a business above to get started.</li>}
            {rows?.map((b) => (
              <li key={b.id} className="border-t border-line">
                <Link
                  href={`/b/${b.id}`}
                  onMouseEnter={() => setHover(`b${b.id}`)}
                  onMouseLeave={() => setHover(null)}
                  className="flex gap-3 items-center px-5 py-3.5 hover:bg-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[15px] truncate">{b.name}</span>
                    <span className="block text-[13px] text-muted truncate">
                      {b.keywords ? `${b.keywords} keyword${b.keywords > 1 ? "s" : ""} · last scan ${fmtDate(b.lastScan as string)}` : "No scans yet"}
                    </span>
                  </span>
                  {b.avgRank != null && (
                    <span className="flex flex-col items-end gap-0.5">
                      <RankChip value={b.avgRank} />
                      <span className="text-[11.5px] text-muted">avg position</span>
                    </span>
                  )}
                  <span aria-hidden className="text-muted text-[20px]">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
