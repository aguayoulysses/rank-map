"use client";

import { useMemo, useState } from "react";
import MapView, { type MapPin } from "./MapView";
import { Competitors, PointResults } from "./ScanReport";
import { Legend } from "./ui";
import type { Pin, Scan } from "@/lib/db";
import { rippleDelay, scanRadiusMi } from "@/lib/grid";
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_TEXT,
  competitors,
  downloadCsv,
  driverText,
  keyOf,
  market,
  pointDifficulty,
  rankOf,
  searchTerms,
  toCsv,
  type Difficulty,
  type PointDifficulty,
} from "@/lib/insights";

const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard", "very hard": "Very hard" };
const DIFF_RANGE: Record<Difficulty, string> = { easy: "under 30", moderate: "30 to 54", hard: "55 to 77", "very hard": "78+" };

/** map pin for one point's difficulty */
export function difficultyPin(d: PointDifficulty) {
  return { color: DIFFICULTY_COLOR[d.difficulty], ink: DIFFICULTY_TEXT[d.difficulty], text: String(d.score) };
}

export function DifficultyLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`panel px-3.5 py-2.5 text-[13px] ${className}`} role="note" aria-label="Pin color key">
      <div className="font-bold">Pin number = how hard it is to get into the top 3 there (0 to 100)</div>
      <div className="text-muted mb-1">Weighs whether the top 3 match the search, how close they are, and their reviews and rating.</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
        {(Object.keys(DIFF_LABEL) as Difficulty[]).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: DIFFICULTY_COLOR[d] }} />
            {DIFF_LABEL[d]} <span className="text-muted font-medium">({DIFF_RANGE[d]})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Market research report: how hard this area is to rank in, and who owns it. */
export default function MarketReport({ scan, pins, top, actions }: { scan: Scan; pins: Pin[]; top?: React.ReactNode; actions?: React.ReactNode }) {
  const [sel, setSel] = useState<number | null>(null);
  const [lens, setLens] = useState<string | null>(null);
  const m = useMemo(() => market(pins, scan.keyword), [pins, scan.keyword]);
  const terms = useMemo(() => searchTerms(scan.keyword), [scan.keyword]);
  const points = useMemo(() => new Map(pins.map((p) => [p.idx, pointDifficulty(p, terms)])), [pins, terms]);
  const lensInfo = useMemo(() => (lens ? competitors(pins).find((c) => c.key === lens) ?? null : null), [lens, pins]);
  const radius = scanRadiusMi(scan.shape, scan.layers, scan.spacingMi);
  const center = { lat: scan.centerLat, lng: scan.centerLng };

  const mapPins: MapPin[] = useMemo(
    () =>
      pins.map((p) => {
        const delay = 350 + rippleDelay(center, p, radius);
        if (lens) return { key: `p${p.idx}`, lat: p.lat, lng: p.lng, state: "ranked" as const, rank: rankOf(p, lens), delay };
        return { key: `p${p.idx}`, lat: p.lat, lng: p.lng, state: "ranked" as const, rank: null, ...difficultyPin(points.get(p.idx)!), delay };
      }),
    [pins, lens, points] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = pins.find((p) => p.idx === sel) ?? null;
  const selDiff = selected ? points.get(selected.idx) ?? null : null;
  const weakPct = pins.length ? Math.round((m.weakSpots / pins.length) * 100) : 0;

  return (
    <main className="relative h-full">
      <MapView
        pins={mapPins}
        center={center}
        selected={sel == null ? null : `p${sel}`}
        onPinClick={(k) => setSel(Number(k.slice(1)))}
        fitKey={`m${scan.id}`}
        centerIcon="place"
        focus={{ ...center, radiusMi: radius }}
        padding={{ top: 160, bottom: 110, left: 450, right: sel != null ? 430 : 80 }}
      />
      {top}
      {lens ? <Legend className="absolute z-10 bottom-3 right-14 hidden sm:flex" /> : <DifficultyLegend className="absolute z-10 bottom-3 right-14 hidden sm:block max-w-[520px]" />}
      {lensInfo && (
        <div role="status" className="absolute z-10 top-[140px] left-3 right-3 sm:left-[468px] sm:right-auto sm:w-[min(520px,calc(100%-500px))] rounded-xl bg-ink text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
          <span className="flex-1 min-w-0 text-[14px]">
            Showing <b>{lensInfo.title}</b>&apos;s rankings · top 3 on {Math.round(lensInfo.solv * 100)}% of the map
          </span>
          <button onClick={() => setLens(null)} className="btn !min-h-9 bg-accent text-accent-ink px-3 text-[13.5px]">Back to difficulty</button>
        </div>
      )}

      <div className="absolute z-10 left-3 right-3 bottom-3 max-h-[52%] sm:max-h-none sm:top-[76px] sm:right-auto sm:left-4 sm:w-[430px] flex flex-col gap-3 overflow-y-auto scroll-thin rounded-[14px]">
        <section className="panel p-5 flex flex-col gap-4" aria-label="Market summary">
          <div>
            <div className="text-[13px] font-bold text-muted">Market research</div>
            <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{scan.label}</h2>
            <div className="text-[14px] text-ink-2 mt-0.5">“{scan.keyword}”</div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-soft p-4">
            <div className="relative h-[92px] w-[92px] shrink-0" role="img" aria-label={`Difficulty ${m.score} out of 100`}>
              <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
                <circle cx="21" cy="21" r="17" fill="none" stroke="#e7e7e3" strokeWidth="5" />
                <circle cx="21" cy="21" r="17" fill="none" stroke={DIFFICULTY_COLOR[m.difficulty]} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(m.score / 100) * 106.8} 106.8`} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-[26px] font-extrabold num">{m.score}</span>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink-2">Difficulty</div>
              <span className="inline-block mt-1 rounded-full px-3 py-1 text-[14px] font-extrabold" style={{ background: DIFFICULTY_COLOR[m.difficulty], color: DIFFICULTY_TEXT[m.difficulty] }}>
                {DIFF_LABEL[m.difficulty]}
              </span>
              <div className="text-[12.5px] text-muted mt-1.5">0 = wide open, 100 = locked up</div>
            </div>
          </div>
          <p className="text-[15px] leading-snug">
            {m.reviewsToTop3 == null ? (
              <>Google barely shows results for this search here. Anyone who shows up can win it.</>
            ) : (
              <>
                {m.onTarget != null && m.onTarget < 0.5 ? (
                  <>
                    Only <b>{Math.round(m.onTarget * 100)}%</b> of top-3 spots go to businesses that match this search. The rest are mostly{" "}
                    <b>{(m.offTargetCategory ?? "other kinds of business").toLowerCase()}</b> listings, which a matching business can push past.{" "}
                  </>
                ) : (
                  <>Most top-3 spots go to businesses that match this search. </>
                )}
                The weakest of the top 3 usually has <b>{m.reviewsToTop3} reviews</b>, and the usual #1 has <b>{m.leaderReviews != null ? Math.round(m.leaderReviews) : "–"}</b>.
              </>
            )}
          </p>
          <dl className="grid grid-cols-2 gap-2">
            <Stat label="Match the search" value={m.onTarget == null ? "–" : `${Math.round(m.onTarget * 100)}%`} hint="Share of top-3 spots held by businesses whose category or name matches the search" sub="of top-3 spots" />
            <Stat label="Typical distance" value={m.typicalMiles == null ? "–" : `${m.typicalMiles.toFixed(1)} mi`} hint="Median distance from a point to the businesses in its top 3. Far = no strong option close by" sub="from searcher to top 3" />
            <Stat label="Easy spots" value={`${m.weakSpots} of ${pins.length}`} hint="Points that score under 30" sub={`${weakPct}% of the map`} />
            <Stat label="Fewest reviews in top 3" value={m.reviewsToTop3 == null ? "–" : String(m.reviewsToTop3)} hint="Median, across the map, of the lowest review count among the top 3" sub="typical point" />
            <Stat label="Top-3 rating" value={m.avgTop3Rating == null ? "–" : `${m.avgTop3Rating.toFixed(1)}★`} hint="Average star rating of the top 3 businesses" />
            <Stat label="Businesses in top 3" value={String(m.top3Holders)} hint="How many different businesses hold a top-3 spot somewhere; more = less locked up" />
          </dl>
          {m.categories.length > 0 && (
            <div>
              <div className="text-[12.5px] text-muted font-semibold mb-1">Who holds the top 3</div>
              <ul className="flex flex-col gap-1">
                {m.categories.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 text-[13.5px]">
                    <span className="w-24 h-2 rounded-full bg-soft-2 overflow-hidden shrink-0">
                      <span className="block h-full bg-ink" style={{ width: `${Math.round(c.share * 100)}%` }} />
                    </span>
                    <span className="num font-bold w-10">{Math.round(c.share * 100)}%</span>
                    <span className="truncate">{c.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.leader && (
            <p className="help">
              <b className="text-ink">{m.leader.title}</b> leads, in the top 3 on {Math.round(m.leaderSolv * 100)}% of the map with {m.leader.reviews ?? 0} reviews.
            </p>
          )}
          {actions}
          <button onClick={() => downloadCsv(`${scan.label} - ${scan.keyword}.csv`, toCsv(pins, scan.keyword))} className="text-left text-[13.5px] font-semibold underline">
            Download all results as a spreadsheet (CSV)
          </button>
        </section>
        <Competitors pins={pins} active={lens} onPick={(k) => setLens(k === lens ? null : k)} title="Who owns this market" limit={8} />
        <p className="panel px-4 py-3 text-[14px]"><b>Tip:</b> click any pin to see exactly what Google shows there.</p>
      </div>

      {selected && (
        <div className="absolute z-20 inset-x-3 bottom-3 max-h-[60%] sm:inset-x-auto sm:right-3 sm:top-[76px] sm:bottom-3 sm:max-h-none sm:w-[400px] flex">
          <PointResults
            scan={scan}
            pin={selected}
            onClose={() => setSel(null)}
            highlight={lens}
            note={
              selDiff && !lens ? (
                <div className="px-4 py-3 border-b border-line flex gap-3 items-start">
                  <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold num whitespace-nowrap" style={{ background: DIFFICULTY_COLOR[selDiff.difficulty], color: DIFFICULTY_TEXT[selDiff.difficulty] }}>
                    {selDiff.score} · {DIFF_LABEL[selDiff.difficulty]}
                  </span>
                  <p className="text-[13.5px] leading-snug">{driverText(selDiff)}</p>
                </div>
              ) : null
            }
            tag={(it) => {
              const h = lens ? null : selDiff?.holders.find((x) => keyOf(x.item) === keyOf(it));
              if (!h) return null;
              return (
                <div className="text-[12px] text-ink-2 mt-0.5">
                  {h.relevance >= 0.5 ? "Matches the search" : "Not a match for the search"}
                  {h.miles != null ? ` · ${h.miles.toFixed(1)} mi away` : " · hides its address"}
                  {` · hard to beat: ${h.strength}/100`}
                </div>
              );
            }}
          />
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, hint, sub }: { label: string; value: string; hint: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5" title={hint}>
      <dt className="text-[12.5px] text-muted font-semibold leading-tight">{label}</dt>
      <dd className="text-[19px] font-extrabold num leading-tight mt-0.5">{value}</dd>
      {sub && <dd className="text-[12px] text-muted">{sub}</dd>}
    </div>
  );
}
