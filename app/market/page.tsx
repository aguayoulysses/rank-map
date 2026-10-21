"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MapView, { type MapPin } from "@/components/MapView";
import { DifficultyLegend, difficultyPin } from "@/components/MarketReport";
import { TopBar, fmtDate } from "@/components/ui";
import type { Pin, Scan } from "@/lib/db";
import { COST_PER_PIN, DRIVE_PRESETS, buildGrid, pinCount, scanRadiusMi } from "@/lib/grid";
import { DIFFICULTY_COLOR, DIFFICULTY_TEXT, difficultyOf, pointDifficulty, searchTerms } from "@/lib/insights";

const DETAIL = [
  { layers: 2, label: "Quick" },
  { layers: 3, label: "Standard" },
  { layers: 4, label: "Detailed" },
  { layers: 5, label: "Very detailed" },
];

interface Place {
  label: string;
  lat: number;
  lng: number;
}


export default function Market() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [dist, setDist] = useState("d15");
  const [layers, setLayers] = useState(3);
  const [err, setErr] = useState("");
  const [run, setRun] = useState<{ keyword: string; pins: Map<number, Pin>; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setScans(d.scans ?? []))
      .catch(() => setScans([]));
  }, []);

  const preset = DRIVE_PRESETS.find((p) => p.id === dist)!;
  const spacing = preset.radiusMi / layers;
  const grid = useMemo(() => (place ? buildGrid(place, "circle", layers, spacing) : []), [place, layers, spacing]);
  const allKeywords = kwInput.trim() ? [...keywords, kwInput.trim().toLowerCase()] : keywords;
  const cost = grid.length * Math.max(1, allKeywords.length) * COST_PER_PIN;
  const busy = !!run;

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setErr("");
    const r = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
    const d = await r.json();
    setSearching(false);
    if (!r.ok) return setErr(d.error ?? "Place search didn't work");
    setResults(d.results);
    if (!d.results.length) setErr("No place found. Try a city and state, like “Austin, TX”.");
    if (d.results.length === 1) pick(d.results[0]);
  }

  function pick(p: Place) {
    const short = p.label.split(",").slice(0, 2).join(",").trim();
    setPlace({ ...p, label: short });
    setResults(null);
    setQ(short);
  }

  function addKeyword(k: string) {
    const v = k.trim().toLowerCase();
    if (v && !keywords.includes(v) && keywords.length < 3) setKeywords([...keywords, v]);
    setKwInput("");
  }

  async function start() {
    if (!place || !allKeywords.length) return;
    const kws = allKeywords;
    setKeywords(kws);
    setKwInput("");
    setErr("");
    const r = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: place.label, keywords: kws, shape: "circle", layers, spacingMi: spacing, distanceLabel: preset.label, zoom: 13, center: { lat: place.lat, lng: place.lng }, skip: [] }),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      return setErr(d.error ?? "The research didn't start");
    }
    let state = { keyword: kws[0], pins: new Map<number, Pin>(), total: grid.length };
    setRun(state);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let first: number | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "scan") {
          first ??= ev.scan.id;
          state = { keyword: ev.scan.keyword, pins: new Map(), total: grid.length };
        } else if (ev.type === "pin") {
          state.pins.set(ev.pin.idx, ev.pin);
          state = { ...state };
        }
        setRun(state);
      }
    }
    setRun(null);
    if (first) router.push(`/market/${first}`);
  }

  const mapPins: MapPin[] = useMemo(
    () =>
      grid.map((p) => {
        const key = `g${p.i}`;
        const done = run?.pins.get(p.i);
        if (done) {
          return { key, lat: p.lat, lng: p.lng, state: "ranked" as const, rank: null, ...difficultyPin(pointDifficulty(done, searchTerms(run!.keyword))) };
        }
        return { key, lat: p.lat, lng: p.lng, state: run ? ("pending" as const) : ("preview" as const) };
      }),
    [grid, run]
  );

  return (
    <main className="relative h-full">
      <MapView
        pins={mapPins}
        center={place}
        draggableCenter={!!place && !busy}
        onCenterDrag={(c) => setPlace(place ? { ...place, ...c } : null)}
        fitKey={place ? `${place.lat.toFixed(4)},${place.lng.toFixed(4)}|${layers}|${dist}` : undefined}
        centerIcon="place"
        focus={place ? { ...place, radiusMi: scanRadiusMi("circle", layers, spacing) } : null}
        padding={{ top: 110, bottom: 70, left: 480, right: 60 }}
      />
      <TopBar />
      {busy && <DifficultyLegend className="absolute z-10 bottom-3 right-14 hidden sm:block max-w-[520px]" />}
      <div className="absolute z-10 left-3 right-3 bottom-3 max-h-[60%] sm:max-h-none sm:top-[76px] sm:right-auto sm:left-4 sm:w-[440px] flex flex-col gap-3 overflow-y-auto scroll-thin rounded-[14px]">
        <section className="panel p-5 flex flex-col gap-5">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-tight">Market research</h1>
            <p className="help mt-1 text-[14px]">Check how hard it is to rank anywhere, before you have a client there. See who owns the map, how many reviews it takes, and where the gaps are.</p>
          </div>

          <div className="step">
            <span className={`step-n ${place ? "done" : ""}`} aria-hidden>{place ? "✓" : "1"}</span>
            <div className="min-w-0">
              <label htmlFor="place" className="block text-[16px] font-extrabold">Where?</label>
              <p className="help mt-0.5">A city, neighborhood or address. You can drag the pin after.</p>
              <form onSubmit={search} className="mt-2 flex gap-2">
                <input id="place" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Austin, TX" className="field flex-1 min-w-0 px-3.5 text-[15px]" disabled={busy} />
                <button className="btn btn-ghost" disabled={busy || searching || q.trim().length < 2}>{searching ? "Finding…" : "Find"}</button>
              </form>
              {results && results.length > 1 && (
                <ul className="mt-2 flex flex-col gap-1" aria-label="Places found">
                  {results.map((r) => (
                    <li key={`${r.lat},${r.lng}`}>
                      <button onClick={() => pick(r)} className="w-full text-left rounded-lg border-[1.5px] border-line-strong hover:border-ink px-3 py-2 text-[14px]">{r.label}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="step">
            <span className={`step-n ${allKeywords.length ? "done" : ""}`} aria-hidden>{allKeywords.length ? "✓" : "2"}</span>
            <div className="min-w-0">
              <label htmlFor="mkw" className="block text-[16px] font-extrabold">What would customers search?</label>
              <p className="help mt-0.5">Press Enter after each one. Up to 3.</p>
              <div className="field mt-2 flex flex-wrap gap-1.5 p-1.5">
                {keywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-accent text-accent-ink text-[14px] font-bold pl-2.5 pr-1 py-1">
                    {k}
                    <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="h-7 w-7 rounded-md hover:bg-black/10" aria-label={`Remove ${k}`} disabled={busy}>×</button>
                  </span>
                ))}
                <input
                  id="mkw"
                  value={kwInput}
                  disabled={busy}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addKeyword(kwInput);
                    }
                  }}
                  placeholder={keywords.length ? "Add another" : "e.g. roofer"}
                  className="flex-1 min-w-[150px] bg-transparent outline-none px-2 py-1.5 text-[15px]"
                />
              </div>
            </div>
          </div>

          <div className="step">
            <span className="step-n" aria-hidden>3</span>
            <div className="min-w-0 flex flex-col gap-3">
              <div>
                <h3 className="text-[16px] font-extrabold" id="m-area">How big an area?</h3>
                <div className="seg grid-cols-2 mt-2" role="group" aria-labelledby="m-area">
                  {DRIVE_PRESETS.map((p) => (
                    <button key={p.id} aria-pressed={dist === p.id} onClick={() => setDist(p.id)} disabled={busy}>
                      <b className="text-[14.5px]">{p.label.replace("-minute drive", " min drive")}</b>
                      <small>about {p.radiusMi} miles out</small>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[16px] font-extrabold" id="m-detail">How many points?</h3>
                <div className="seg grid-cols-2 mt-2" role="group" aria-labelledby="m-detail">
                  {DETAIL.map((d) => (
                    <button key={d.layers} aria-pressed={layers === d.layers} onClick={() => setLayers(d.layers)} disabled={busy}>
                      <b className="text-[14.5px]">{d.label}</b>
                      <small>{pinCount("circle", d.layers)} points · ${(pinCount("circle", d.layers) * COST_PER_PIN).toFixed(2)}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-soft p-4 flex flex-col gap-3">
            <p className="text-[14px] text-ink-2" aria-live="polite">
              {!place ? "Pick a place in step 1." : !allKeywords.length ? "Add a search in step 2." : (
                <>Checks <b className="text-ink num">{grid.length} points</b> around <b className="text-ink">{place.label}</b> for {allKeywords.length} search{allKeywords.length > 1 ? "es" : ""}. About <b className="text-ink num">${cost.toFixed(2)}</b>.</>
              )}
            </p>
            <button onClick={start} disabled={busy || !place || !allKeywords.length} className="btn btn-primary w-full text-[16px]">{busy ? "Researching…" : "Run research"}</button>
            {err && <p role="alert" className="text-bad text-[14px] font-semibold">{err}</p>}
            {run && (
              <div className="flex flex-col gap-1.5" aria-live="polite">
                <div className="flex justify-between text-[14px] font-semibold">
                  <span className="truncate">Checking “{run.keyword}”</span>
                  <span className="num">{run.pins.size} of {run.total}</span>
                </div>
                <div className="h-2.5 rounded-full bg-soft-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.pins.size}>
                  <div className="h-full bg-ink transition-all" style={{ width: `${(run.pins.size / Math.max(1, run.total)) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-label="Past research">
          <h2 className="px-5 pt-4 pb-2 text-[16px] font-extrabold tracking-tight">Past research</h2>
          {scans?.length === 0 && <p className="px-5 pb-4 help">Nothing yet. Your research will be saved here.</p>}
          <ul>
            {scans?.map((s) => {
              const d = s.score == null ? null : difficultyOf(s.score);
              return (
                <li key={s.id} className="border-t border-line">
                  <Link href={`/market/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-soft">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-[15px] truncate">“{s.keyword}” in {s.label}</span>
                      <span className="block text-[12.5px] text-muted truncate">{fmtDate(s.createdAt)} · {s.pinCount} points</span>
                    </span>
                    {d && (
                      <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold num whitespace-nowrap" style={{ background: DIFFICULTY_COLOR[d], color: DIFFICULTY_TEXT[d] }}>
                        {s.score} · {d}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
