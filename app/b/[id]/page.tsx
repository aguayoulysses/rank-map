"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MapView, { type MapPin } from "@/components/MapView";
import { Competitors, PointResults, SummaryCard } from "@/components/ScanReport";
import { Legend, RankChip, Stars, TopBar, fmtDate } from "@/components/ui";
import type { Business, Pin, Scan } from "@/lib/db";
import { businessKey, competitors as compList, downloadCsv, rankOf, sameGrid, solvDistance, toCsv } from "@/lib/insights";
import { COST_PER_PIN, DRIVE_PRESETS, buildGrid, haversineMi, pinCount, rippleDelay, scanRadiusMi, type Shape } from "@/lib/grid";

const DETAIL = [
  { layers: 2, label: "Quick" },
  { layers: 3, label: "Standard" },
  { layers: 4, label: "Detailed" },
  { layers: 5, label: "Very detailed" },
];
const ZOOMS = [
  { z: 12, label: "12z · wide" },
  { z: 13, label: "13z · recommended" },
  { z: 14, label: "14z · tight" },
  { z: 15, label: "15z · street" },
];

interface Run {
  keyword: string;
  index: number;
  of: number;
  pins: Map<number, Pin>;
  total: number;
  errors: number;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Workspace id={Number(id)} />
    </Suspense>
  );
}

function Workspace({ id }: { id: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const scanParam = sp.get("scan");
  const [business, setBusiness] = useState<Business | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/businesses/${id}`);
    if (!r.ok) return setMissing(true);
    const d = await r.json();
    setBusiness(d.business);
    setScans(d.scans);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (missing)
    return (
      <main className="h-full grid place-items-center">
        <p className="help text-[15px]">
          That business was removed. <Link className="font-bold underline" href="/">Back to businesses</Link>
        </p>
      </main>
    );
  if (!business) return <main className="h-full grid place-items-center help text-[15px]">Loading…</main>;
  return scanParam ? (
    <ScanScreen key={scanParam} business={business} scans={scans} scanId={Number(scanParam)} onGone={() => { load(); router.replace(`/b/${id}`); }} />
  ) : (
    <SetupScreen business={business} scans={scans} reload={load} setBusiness={setBusiness} />
  );
}

/* ---------------------------------------------------------------- setup + run */

function SetupScreen({ business, scans, reload, setBusiness }: { business: Business; scans: Scan[]; reload: () => Promise<unknown>; setBusiness: (b: Business) => void }) {
  const router = useRouter();
  const lastScan = scans[0];
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [shape, setShape] = useState<Shape>(lastScan?.shape ?? "circle");
  const [layers, setLayers] = useState(lastScan?.layers ?? 3);
  const [dist, setDist] = useState<string>("d15");
  const [customMi, setCustomMi] = useState(1);
  const [zoom, setZoom] = useState(13);
  const [skipWater, setSkipWater] = useState(true);
  const [water, setWater] = useState<Set<string>>(new Set());
  const [center, setCenter] = useState({ lat: business.centerLat, lng: business.centerLng });
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [coordInput, setCoordInput] = useState("");
  const [coordErr, setCoordErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [off, setOff] = useState<Set<number>>(new Set());

  const preset = DRIVE_PRESETS.find((p) => p.id === dist);
  const spacing = preset ? preset.radiusMi / layers : Math.max(0.1, customMi);
  const grid = useMemo(() => buildGrid(center, shape, layers, spacing), [center, shape, layers, spacing]);
  useEffect(() => setOff(new Set()), [grid]);
  const city = business.serviceCities[0]?.split(",")[0] ?? business.address?.split(",").slice(-2, -1)[0]?.trim() ?? "";
  const cat = (business.category ?? "").toLowerCase();
  const suggestions = cat ? [...new Set([cat, `${cat} near me`, city ? `${cat} ${city.toLowerCase()}` : "", `best ${cat}`].filter(Boolean))] : [];
  const skip = grid.filter((p) => off.has(p.i) || (skipWater && water.has(`g${p.i}`))).map((p) => p.i);
  const pinsPerKw = grid.length - skip.length;
  const allKeywords = kwInput.trim() ? [...keywords, kwInput.trim().toLowerCase()] : keywords;
  const cost = pinsPerKw * Math.max(1, allKeywords.length) * COST_PER_PIN;
  const movedMi = haversineMi(center, business);
  const pastKeywords = [...new Set(scans.map((s) => s.keyword))];
  const busy = !!run;

  function addKeyword(k: string) {
    const v = k.trim().toLowerCase();
    if (v && !keywords.includes(v) && keywords.length < 5) setKeywords([...keywords, v]);
    setKwInput("");
  }

  async function moveCenter(c: { lat: number; lng: number }) {
    setCenter(c);
    setWater(new Set());
    setBusiness({ ...business, centerLat: c.lat, centerLng: c.lng });
    await fetch(`/api/businesses/${business.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ centerLat: c.lat, centerLng: c.lng }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function start() {
    const kws = allKeywords;
    if (!kws.length) return;
    setKeywords(kws);
    setKwInput("");
    setErr("");
    const r = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: business.id, keywords: kws, shape, layers, spacingMi: spacing, distanceLabel: preset ? preset.label : `${spacing} mi apart`, zoom, center, skip }),
    });
    if (!r.ok || !r.body) {
      const d = await r.json().catch(() => ({}));
      return setErr(d.error ?? "The scan didn't start. Try again.");
    }
    let state: Run = { keyword: kws[0], index: 0, of: kws.length, pins: new Map(), total: pinsPerKw, errors: 0 };
    setRun(state);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let firstScan: number | null = null;
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
          firstScan ??= ev.scan.id;
          state = { ...state, keyword: ev.scan.keyword, index: kws.indexOf(ev.scan.keyword), pins: new Map(), errors: 0 };
        } else if (ev.type === "pin") {
          state.pins.set(ev.pin.idx, ev.pin);
          state = { ...state };
        } else if (ev.type === "pinError") {
          state = { ...state, errors: state.errors + 1 };
        }
        setRun(state);
      }
    }
    await reload();
    setRun(null);
    setKeywords([]);
    if (firstScan) router.push(`/b/${business.id}?scan=${firstScan}`);
  }

  async function del(scanId: number) {
    await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
    setConfirmDel(null);
    reload();
  }

  const mapPins: MapPin[] = useMemo(
    () =>
      grid.map((p) => {
        const key = `g${p.i}`;
        if (skip.includes(p.i)) return { key, lat: p.lat, lng: p.lng, state: "water" as const, off: off.has(p.i) };
        const done = run?.pins.get(p.i);
        if (done) return { key, lat: p.lat, lng: p.lng, state: "ranked" as const, rank: done.rank };
        return { key, lat: p.lat, lng: p.lng, state: run ? ("pending" as const) : ("preview" as const) };
      }),
    [grid, run, water, skipWater, off] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fitKey = `${shape}|${layers}|${spacing.toFixed(3)}|${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;

  return (
    <main className="relative h-full">
      <MapView
        pins={mapPins}
        center={center}
        gbp={{ lat: business.lat, lng: business.lng }}
        draggableCenter={!busy}
        onCenterDrag={moveCenter}
        onPinClick={(k) => {
          if (busy || !k.startsWith("g")) return;
          const i = Number(k.slice(1));
          const s = new Set(off);
          if (s.has(i)) s.delete(i);
          else s.add(i);
          setOff(s);
        }}
        fitKey={fitKey}
        focus={{ ...center, radiusMi: scanRadiusMi(shape, layers, spacing) }}
        padding={{ top: 110, bottom: 70, left: 480, right: 60 }}
        onWater={(keys) => setWater(new Set(keys))}
      />
      <TopBar />
      {busy && <Legend className="absolute z-10 bottom-3 right-14 hidden sm:flex" />}
      <div className="absolute z-10 left-3 right-3 bottom-3 max-h-[60%] sm:max-h-none sm:top-[76px] sm:right-auto sm:left-4 sm:w-[440px] flex flex-col gap-3 overflow-y-auto scroll-thin rounded-[14px]">
        <section className="panel p-5 flex flex-col gap-5">
          <div>
            <Link href="/" className="inline-flex items-center min-h-8 text-[14px] font-semibold text-ink-2 hover:underline">← All businesses</Link>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight mt-1">{business.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-muted">
              <Stars rating={business.rating} reviews={business.reviews} />
              {business.category && <span>· {business.category}</span>}
            </div>
          </div>

          <h2 className="sr-only">Set up a scan</h2>

          {/* step 1 */}
          <div className="step">
            <span className="step-n" aria-hidden>1</span>
            <div className="min-w-0">
              <h3 className="text-[16px] font-extrabold">Where does the business work from?</h3>
              <p className="help mt-0.5">
                Drag the <b className="text-ink">yellow house pin</b> on the map to the real home base. Service businesses rank from that spot, not from the dot Google shows.
              </p>
              {business.serviceArea && movedMi < 0.05 && (
                <p className="mt-2 rounded-lg bg-accent/25 px-3 py-2 text-[13.5px]">
                  <b>Move the pin before scanning.</b> Google hides this business&apos;s address, so the pin starts where Google Maps shows it, which usually isn&apos;t where it ranks from.
                </p>
              )}
              {business.serviceCities.length > 0 && (
                <p className="help mt-2">Serves on Google: {business.serviceCities.join(", ")}</p>
              )}
              <form
                className="mt-2.5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const m = coordInput.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
                  if (!m) return setCoordErr("Paste it like this: 33.8613, -117.7849");
                  const c = { lat: Number(m[1]), lng: Number(m[2]) };
                  if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return setCoordErr("Those numbers aren't a spot on the map.");
                  setCoordErr("");
                  setCoordInput("");
                  moveCenter(c);
                }}
              >
                <label htmlFor="coords" className="sr-only">Home base coordinates</label>
                <input id="coords" value={coordInput} onChange={(e) => setCoordInput(e.target.value)} placeholder="Or paste coordinates" className="field flex-1 min-w-0 px-3 text-[14px]" disabled={busy} aria-describedby="coords-help" />
                <button className="btn btn-ghost" disabled={busy || !coordInput.trim()}>Move pin</button>
              </form>
              <p id="coords-help" className="help mt-1.5">
                {coordErr ? <span role="alert" className="text-bad font-semibold">{coordErr}</span> : "In Google Maps, right-click the spot and click the numbers to copy them."}
              </p>
              <p className="mt-1.5 text-[13px] text-ink-2 num" aria-live="polite">
                {saved ? <b className="text-good">Home base saved.</b> : movedMi > 0.05 ? <>Moved {movedMi.toFixed(1)} mi from the Google pin (“G”). </> : "Sitting on the Google pin."}
                {movedMi > 0.05 && !saved && (
                  <button className="font-bold underline" onClick={() => moveCenter({ lat: business.lat, lng: business.lng })} disabled={busy}>Put it back</button>
                )}
              </p>
            </div>
          </div>

          {/* step 2 */}
          <div className="step">
            <span className={`step-n ${allKeywords.length ? "done" : ""}`} aria-hidden>{allKeywords.length ? "✓" : "2"}</span>
            <div className="min-w-0">
              <label htmlFor="kw" className="block text-[16px] font-extrabold">What do customers search?</label>
              <p className="help mt-0.5">Type a search and press Enter. Add up to 5.</p>
              <div className="field mt-2 flex flex-wrap gap-1.5 p-1.5">
                {keywords.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-accent text-accent-ink text-[14px] font-bold pl-2.5 pr-1 py-1">
                    {k}
                    <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="h-7 w-7 rounded-md hover:bg-black/10" aria-label={`Remove ${k}`} disabled={busy}>×</button>
                  </span>
                ))}
                <input
                  id="kw"
                  value={kwInput}
                  disabled={busy}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addKeyword(kwInput);
                    } else if (e.key === "Backspace" && !kwInput && keywords.length) setKeywords(keywords.slice(0, -1));
                  }}
                  placeholder={keywords.length ? "Add another" : "e.g. gardening service"}
                  className="flex-1 min-w-[150px] bg-transparent outline-none px-2 py-1.5 text-[15px]"
                />
              </div>
              {suggestions.filter((k) => !keywords.includes(k) && !pastKeywords.includes(k)).length > 0 && (
                <div className="mt-2">
                  <span className="help">Suggested: </span>
                  <span className="inline-flex flex-wrap gap-1.5 align-middle">
                    {suggestions.filter((k) => !keywords.includes(k) && !pastKeywords.includes(k)).map((k) => (
                      <button key={k} onClick={() => addKeyword(k)} disabled={busy} className="rounded-full border-[1.5px] border-dashed border-line-strong px-3 py-1 text-[13px] font-semibold hover:border-ink">+ {k}</button>
                    ))}
                  </span>
                </div>
              )}
              {pastKeywords.filter((k) => !keywords.includes(k)).length > 0 && (
                <div className="mt-2">
                  <span className="help">Scanned before: </span>
                  <span className="inline-flex flex-wrap gap-1.5 align-middle">
                    {pastKeywords.filter((k) => !keywords.includes(k)).map((k) => (
                      <button key={k} onClick={() => addKeyword(k)} disabled={busy} className="rounded-full border-[1.5px] border-line-strong px-3 py-1 text-[13px] font-semibold hover:border-ink">+ {k}</button>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* step 3 */}
          <div className="step">
            <span className="step-n" aria-hidden>3</span>
            <div className="min-w-0 flex flex-col gap-3">
              <div>
                <h3 className="text-[16px] font-extrabold" id="area-h">How far around it?</h3>
                <div className="seg grid-cols-2 mt-2" role="group" aria-labelledby="area-h">
                  {DRIVE_PRESETS.map((p) => (
                    <button key={p.id} aria-pressed={dist === p.id} onClick={() => setDist(p.id)} disabled={busy}>
                      <b className="text-[14.5px]">{p.label.replace("-minute drive", " min drive")}</b>
                      <small>about {p.radiusMi} miles out</small>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[16px] font-extrabold" id="detail-h">How many points?</h3>
                <div className="seg grid-cols-2 mt-2" role="group" aria-labelledby="detail-h">
                  {DETAIL.map((d) => (
                    <button key={d.layers} aria-pressed={layers === d.layers} onClick={() => setLayers(d.layers)} disabled={busy}>
                      <b className="text-[14.5px]">{d.label}</b>
                      <small>{pinCount(shape, d.layers)} points · ${(pinCount(shape, d.layers) * COST_PER_PIN).toFixed(2)}</small>
                    </button>
                  ))}
                </div>
              </div>
              <p className="help -mt-1">Tip: click a point on the map to leave it out (crossed out in red). Click again to bring it back.{off.size ? ` ${off.size} left out.` : ""}</p>
              <details className="group rounded-xl border-[1.5px] border-line">
                <summary className="cursor-pointer list-none flex items-center justify-between px-3.5 min-h-11 text-[14px] font-bold">
                  More settings
                  <span aria-hidden className="text-muted group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Select id="shape" label="Shape" value={shape} onChange={(v) => setShape(v as Shape)} disabled={busy} options={[["circle", "Circle"], ["square", "Square"]]} />
                    <Select id="layers" label="Exact rings" value={String(layers)} onChange={(v) => setLayers(Number(v))} disabled={busy} options={[1, 2, 3, 4, 5, 6, 7].map((l) => [String(l), `${l} · ${pinCount(shape, l)} pts`])} />
                    <Select id="zoom" label="Map zoom" value={String(zoom)} onChange={(v) => setZoom(Number(v))} disabled={busy} options={ZOOMS.map((z) => [String(z.z), z.label])} />
                    <Select id="dist" label="Spacing" value={dist === "custom" ? "custom" : "preset"} onChange={(v) => setDist(v === "custom" ? "custom" : "d15")} disabled={busy} options={[["preset", "From drive time"], ["custom", "Set miles myself"]]} />
                  </div>
                  {dist === "custom" && (
                    <label htmlFor="mi" className="flex items-center gap-2 text-[14px]">
                      <input id="mi" type="number" min={0.1} max={10} step={0.1} value={customMi} onChange={(e) => setCustomMi(Number(e.target.value))} className="field w-24 px-3 num" disabled={busy} />
                      miles between points
                    </label>
                  )}
                  <label htmlFor="water" className="flex items-center gap-2.5 text-[14px] cursor-pointer select-none min-h-9">
                    <input id="water" type="checkbox" checked={skipWater} onChange={(e) => setSkipWater(e.target.checked)} className="h-5 w-5 accent-[var(--ink)]" disabled={busy} />
                    Skip points that land on water
                    <span className="text-muted">({water.size} here)</span>
                  </label>
                  <p className="help">Zoom 13z matches what people see on a phone. 14z and closer can make a business look like it vanishes a mile away.</p>
                </div>
              </details>
            </div>
          </div>

          <div className="rounded-xl bg-soft p-4 flex flex-col gap-3">
            <p className="text-[14px] text-ink-2" aria-live="polite">
              {allKeywords.length ? (
                <>
                  Checks <b className="text-ink num">{pinsPerKw} points</b> for <b className="text-ink">{allKeywords.length} search{allKeywords.length > 1 ? "es" : ""}</b>. Costs about <b className="text-ink num">${cost.toFixed(2)}</b>.
                </>
              ) : (
                <>Add a search in step 2 to start.</>
              )}
            </p>
            <button onClick={start} disabled={busy || !allKeywords.length} className="btn btn-primary w-full text-[16px]">
              {busy ? "Scanning…" : "Run scan"}
            </button>
            {err && <p role="alert" className="text-bad text-[14px] font-semibold">{err}</p>}
            {run && (
              <div className="flex flex-col gap-1.5" aria-live="polite">
                <div className="flex justify-between text-[14px] font-semibold">
                  <span className="truncate">Checking “{run.keyword}”{run.of > 1 ? ` (${run.index + 1} of ${run.of})` : ""}</span>
                  <span className="num">{run.pins.size} of {run.total}</span>
                </div>
                <div className="h-2.5 rounded-full bg-soft-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.pins.size}>
                  <div className="h-full bg-ink transition-all" style={{ width: `${(run.pins.size / Math.max(1, run.total)) * 100}%` }} />
                </div>
                <p className="help">Takes about a minute. Results fill in on the map as they come back.</p>
                {run.errors > 0 && <p className="text-medium text-[13px] font-semibold">{run.errors} point{run.errors > 1 ? "s" : ""} didn't load and will be left out.</p>}
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-label="Past scans">
          <h2 className="px-5 pt-4 pb-2 text-[16px] font-extrabold tracking-tight">Past scans</h2>
          {scans.length === 0 && <p className="px-5 pb-4 help">No scans yet. Your results will be saved here.</p>}
          <ul>
            {scans.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 border-t border-line">
                <Link href={`/b/${business.id}?scan=${s.id}`} className="min-w-0 flex-1 group">
                  <span className="block font-bold text-[15px] truncate group-hover:underline">{s.keyword}</span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {fmtDate(s.createdAt)} · {s.pinCount} points{s.status !== "done" ? ` · ${s.status === "running" ? "still running" : "failed"}` : ""}
                  </span>
                </Link>
                <RankChip value={s.avgRank} />
                {confirmDel === s.id ? (
                  <span className="flex gap-1.5">
                    <button onClick={() => del(s.id)} className="btn btn-danger !min-h-9 text-[13px]">Delete</button>
                    <button onClick={() => setConfirmDel(null)} className="btn btn-ghost !min-h-9 text-[13px]">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDel(s.id)} className="btn btn-ghost !min-h-9 !px-2.5 text-[13px]" aria-label={`Delete scan for ${s.keyword}`}>Delete</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Select({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-bold">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="field px-3 text-[14px] w-full">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

/* ---------------------------------------------------------------- one scan */

function ScanScreen({ business, scans, scanId, onGone }: { business: Business; scans: Scan[]; scanId: number; onGone: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ scan: Scan; pins: Pin[] } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [lens, setLens] = useState<string | null>(null);
  const [prevPins, setPrevPins] = useState<Map<number, number | null> | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meKey = businessKey(business);

  useEffect(() => {
    let dead = false;
    const get = async () => {
      const r = await fetch(`/api/scans/${scanId}`);
      if (!r.ok) return onGone();
      const d = await r.json();
      if (dead) return;
      setData(d);
      if (d.scan.status === "running") poll.current = setTimeout(get, 3000);
    };
    get();
    return () => {
      dead = true;
      if (poll.current) clearTimeout(poll.current);
    };
  }, [scanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sameKw = useMemo(() => (data ? scans.filter((s) => s.keyword === data.scan.keyword) : []), [scans, data]);
  const pos = sameKw.findIndex((s) => s.id === scanId);
  const older = pos >= 0 ? sameKw[pos + 1] : undefined;
  const newer = pos > 0 ? sameKw[pos - 1] : undefined;
  const latestByKw = useMemo(() => {
    const m = new Map<string, Scan>();
    for (const s of scans) if (!m.has(s.keyword)) m.set(s.keyword, s);
    return m;
  }, [scans]);

  // the previous scan of this search on the same points, for the change tags
  useEffect(() => {
    setPrevPins(null);
    if (!data || !older || !sameGrid(data.scan, older)) return;
    fetch(`/api/scans/${older.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPrevPins(new Map((d.pins as Pin[]).map((p) => [p.idx, p.rank]))));
  }, [data?.scan.id, older?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const radius = data ? scanRadiusMi(data.scan.shape, data.scan.layers, data.scan.spacingMi) : 1;
  const lensInfo = useMemo(() => (lens && data ? compList(data.pins).find((c) => c.key === lens) ?? null : null), [lens, data]);
  const pins: MapPin[] = useMemo(
    () =>
      (data?.pins ?? []).map((p) => {
        const rank = lens ? rankOf(p, lens) : p.rank;
        const before = !lens && prevPins?.has(p.idx) ? prevPins.get(p.idx) : undefined;
        return {
          key: `p${p.idx}`,
          lat: p.lat,
          lng: p.lng,
          state: "ranked" as const,
          rank,
          delta: before === undefined ? null : (before ?? 21) - (rank ?? 21),
          delay: data ? 350 + rippleDelay({ lat: data.scan.centerLat, lng: data.scan.centerLng }, p, radius) : 0,
        };
      }),
    [data, lens, prevPins] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = data?.pins.find((p) => p.idx === sel) ?? null;
  const go = (s?: Scan) => s && router.push(`/b/${business.id}?scan=${s.id}`);

  async function share() {
    const r = await fetch(`/api/scans/${scanId}`, { method: "POST" });
    const { token } = await r.json();
    const url = `${location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied. Paste it anywhere.");
    } catch {
      setCopied(url);
    }
    setTimeout(() => setCopied(""), 6000);
  }

  async function del() {
    await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
    onGone();
  }

  if (!data) return <main className="h-full grid place-items-center help text-[15px]">Loading results…</main>;
  const { scan } = data;

  return (
    <main className="relative h-full">
      <MapView
        pins={pins}
        center={{ lat: scan.centerLat, lng: scan.centerLng }}
        selected={sel == null ? null : `p${sel}`}
        onPinClick={(k) => setSel(Number(k.slice(1)))}
        fitKey={`scan${scan.id}`}
        focus={{ lat: scan.centerLat, lng: scan.centerLng, radiusMi: radius }}
        padding={{ top: 160, bottom: 80, left: 450, right: sel != null ? 430 : 80 }}
      />
      <TopBar />

      <nav className="absolute z-10 top-[76px] left-3 right-3 sm:left-[468px] sm:right-auto sm:w-[min(520px,calc(100%-500px))] panel px-2 py-2 flex items-center gap-2" aria-label="Scan history">
        <button onClick={() => router.push(`/b/${business.id}`)} className="btn btn-ghost text-[14px] whitespace-nowrap">← New scan</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="font-extrabold text-[14.5px] truncate">{fmtDate(scan.createdAt)}</div>
          <div className="text-[12.5px] text-muted truncate">{scan.status === "running" ? "Still scanning…" : sameKw.length > 1 ? `Scan ${sameKw.length - pos} of ${sameKw.length} for this search` : "Only scan for this search"}</div>
        </div>
        <button onClick={() => go(older)} disabled={!older} className="btn btn-ghost !px-0 w-11" aria-label="Older scan" title="Older scan">‹</button>
        <button onClick={() => go(newer)} disabled={!newer} className="btn btn-ghost !px-0 w-11" aria-label="Newer scan" title="Newer scan">›</button>
      </nav>

      <Legend className="absolute z-10 bottom-3 right-14 hidden sm:flex" />
      {lensInfo && (
        <div role="status" className="absolute z-10 top-[140px] left-3 right-3 sm:left-[468px] sm:right-auto sm:w-[min(520px,calc(100%-500px))] rounded-xl bg-ink text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
          <span className="flex-1 min-w-0 text-[14px]">
            Showing <b>{lensInfo.title}</b>&apos;s rankings · top 3 on {Math.round(lensInfo.solv * 100)}% of the map
          </span>
          <button onClick={() => setLens(null)} className="btn !min-h-9 bg-accent text-accent-ink px-3 text-[13.5px]">Back to {business.name.split(" ")[0]}</button>
        </div>
      )}

      <div className="absolute z-10 left-3 right-3 bottom-3 max-h-[52%] sm:max-h-none sm:top-[76px] sm:right-auto sm:left-4 sm:w-[430px] flex flex-col gap-3 overflow-y-auto scroll-thin rounded-[14px]">
        <SummaryCard
          business={business}
          scan={scan}
          pins={data.pins}
          previous={older}
          keywordSwitch={
            <label htmlFor="kw-switch" className="flex flex-col gap-1">
              <span className="label">Search</span>
              <select id="kw-switch" className="field px-3.5 text-[15px] font-semibold" value={scan.keyword} onChange={(e) => go(latestByKw.get(e.target.value))}>
                {[...latestByKw.keys()].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
          }
          actions={
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button onClick={share} className="btn btn-primary flex-1">Copy share link</button>
                {confirmDel ? (
                  <>
                    <button onClick={del} className="btn btn-danger">Delete</button>
                    <button onClick={() => setConfirmDel(false)} className="btn btn-ghost">Keep</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="btn btn-ghost">Delete</button>
                )}
              </div>
              {copied && <p role="status" className={`text-[13px] ${copied.startsWith("http") ? "break-all select-all" : "text-good font-bold"}`}>{copied}</p>}
              <p className="help">The share link opens a read-only report anyone can see, no password needed.</p>
              <button onClick={() => downloadCsv(`${business.name} - ${scan.keyword}.csv`, toCsv(data.pins, scan.keyword))} className="text-left text-[13.5px] font-semibold underline">
                Download all results as a spreadsheet (CSV)
              </button>
            </div>
          }
        />
        <Competitors pins={data.pins} meKey={meKey} active={lens} onPick={(k) => setLens(k === meKey || k === lens ? null : k)} />
        <p className="panel px-4 py-3 text-[14px]"><b>Tip:</b> click any pin on the map to see exactly what Google shows there.</p>
      </div>

      {selected && (
        <div className="absolute z-20 inset-x-3 bottom-3 max-h-[60%] sm:inset-x-auto sm:right-3 sm:top-[76px] sm:bottom-3 sm:max-h-none sm:w-[400px] flex">
          <PointResults business={business} scan={scan} pin={selected} onClose={() => setSel(null)} highlight={lens} />
        </div>
      )}
    </main>
  );
}
