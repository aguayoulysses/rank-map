"use client";

import { useMemo, useState } from "react";
import { competitors, keyOf, solvDistance } from "@/lib/insights";
import type { Business, Pin, Scan, MapItem } from "@/lib/db";
import { BUCKET_COLOR, BUCKET_INK, BUCKET_LABEL, bucket, haversineMi } from "@/lib/grid";
import { Donut, RankChip, Stars, counts } from "./ui";

/** Left summary card for one scan, written so a business owner can read it. */
export function SummaryCard({
  business,
  scan,
  pins,
  previous,
  keywordSwitch,
  actions,
}: {
  business: Business;
  scan: Scan;
  pins: Pin[];
  previous?: Scan | null;
  keywordSwitch?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const c = counts(pins);
  const n = pins.length || 1;
  const avg = pins.length ? pins.reduce((s, p) => s + (p.rank ?? 21), 0) / pins.length : null;
  const found = pins.filter((p) => p.rank != null);
  const arp = found.length ? found.reduce((s, p) => s + (p.rank as number), 0) / found.length : null;
  const delta = previous?.avgRank != null && avg != null ? previous.avgRank - avg : null;
  const top3Pct = Math.round((c.good / n) * 100);
  const reach = solvDistance(pins, { lat: scan.centerLat, lng: scan.centerLng }, (p) => p.rank);
  return (
    <section className="panel p-5 flex flex-col gap-4" aria-label="Scan summary">
      <div>
        <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{business.name}</h2>
        <div className="mt-1">
          <Stars rating={business.rating} reviews={business.reviews} />
        </div>
      </div>
      {keywordSwitch}
      <p className="text-[15.5px] leading-snug">
        Shows up in the <b>top 3 on {c.good} of {pins.length}</b> map points ({top3Pct}%) when people search <b>“{scan.keyword}”</b>.
      </p>
      <div className="flex items-center gap-4 rounded-xl bg-soft p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink-2">Average position</div>
          <div className="text-[46px] font-extrabold leading-none num mt-1" style={{ color: avg == null ? undefined : BUCKET_INK[bucket(Math.round(avg))] }}>
            {avg == null ? "–" : avg.toFixed(1)}
          </div>
          <div className="text-[12.5px] text-muted mt-1">Lower is better. #1 is the top spot.</div>
          {delta != null && Math.abs(delta) >= 0.05 && (
            <div className={`mt-1.5 text-[13.5px] font-bold ${delta > 0 ? "text-good" : "text-bad"}`}>
              {delta > 0 ? "▲ Up" : "▼ Down"} {Math.abs(delta).toFixed(1)} since the last scan
            </div>
          )}
        </div>
        <Donut pins={pins} size={112} />
      </div>
      <ul className="flex flex-col gap-2" aria-label="Points by position">
        {(["good", "medium", "bad", "none"] as const).map((k) => (
          <li key={k} className="flex items-center gap-3 text-[14.5px]">
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: BUCKET_COLOR[k] }} />
            <span className="flex-1">{BUCKET_LABEL[k]}</span>
            <span className="num font-bold">{c[k]} {c[k] === 1 ? "point" : "points"}</span>
            <span className="num text-muted w-11 text-right">{Math.round((c[k] / n) * 100)}%</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-line px-3 py-2.5">
          <dt className="text-[12.5px] text-muted font-semibold">Position where found</dt>
          <dd className="text-[19px] font-extrabold num">{arp == null ? "–" : arp.toFixed(1)}</dd>
        </div>
        <div className="rounded-lg border border-line px-3 py-2.5">
          <dt className="text-[12.5px] text-muted font-semibold" title="Farthest point from the center where it still shows in the top 3">Top 3 reach</dt>
          <dd className="text-[19px] font-extrabold num">{reach > 0 ? `${reach.toFixed(1)} mi` : "–"}</dd>
        </div>
      </dl>
      {actions}
    </section>
  );
}

/** Every business on this map ranked by average position; click one to see the map through their eyes. */
export function Competitors({
  pins,
  meKey,
  active,
  onPick,
  title = "Who wins this search",
  limit = 6,
}: {
  pins: Pin[];
  /** the client's key, highlighted and always shown */
  meKey?: string | null;
  /** competitor whose map is showing */
  active?: string | null;
  onPick?: (key: string) => void;
  title?: string;
  limit?: number;
}) {
  const list = useMemo(() => competitors(pins), [pins]);
  const [all, setAll] = useState(false);
  const top = list.slice(0, all ? 25 : limit);
  const meIdx = meKey ? list.findIndex((x) => x.key === meKey) : -1;
  const show = meIdx >= top.length ? [...top, list[meIdx]] : top;
  if (!show.length) return null;
  return (
    <section className="panel p-5" aria-label={title}>
      <h3 className="text-[16px] font-extrabold tracking-tight">{title}</h3>
      <p className="help mt-0.5 mb-3">{onPick ? "Click a business to see its rankings on the map." : "Average position across every point on the map."}</p>
      <ol className="flex flex-col gap-1">
        {show.map((c) => {
          const place = list.indexOf(c) + 1;
          const me = c.key === meKey;
          const on = active === c.key;
          const body = (
            <>
              <span className="w-5 text-muted font-bold num text-right">{place}</span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block truncate font-semibold" title={c.title}>{c.title}{me ? " (you)" : ""}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  Top 3 on {Math.round(c.solv * 100)}% · {c.reviews ?? 0} reviews{c.rating != null ? ` · ${c.rating.toFixed(1)}★` : ""}
                </span>
              </span>
              <RankChip value={Math.round(c.avg * 10) / 10} />
            </>
          );
          const cls = `w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] ${on ? "bg-ink text-white [&_.text-muted]:text-[#d4d4d8]" : me ? "bg-accent/25 ring-2 ring-accent" : onPick ? "hover:bg-soft" : ""}`;
          return (
            <li key={c.key}>
              {onPick ? (
                <button className={cls} onClick={() => onPick(c.key)} aria-pressed={on}>{body}</button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {list.length > limit && (
        <button className="mt-2 text-[13.5px] font-semibold underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${Math.min(list.length, 25)}`}
        </button>
      )}
    </section>
  );
}

/** The Google Maps results at one point. */
export function PointResults({
  business,
  scan,
  pin,
  onClose,
  highlight,
  note,
  tag,
}: {
  business?: Business | null;
  scan: Scan;
  pin: Pin;
  onClose: () => void;
  highlight?: string | null;
  /** shown under the header, e.g. why this spot is easy or hard */
  note?: React.ReactNode;
  /** extra line under a business, e.g. how hard it is to beat */
  tag?: (it: MapItem) => React.ReactNode;
}) {
  const mi = haversineMi({ lat: scan.centerLat, lng: scan.centerLng }, pin);
  const mine = (i: MapItem) =>
    highlight ? keyOf(i) === highlight : !!business && ((!!business.cid && i.cid === business.cid) || (!!business.placeId && i.placeId === business.placeId) || i.rank === pin.rank);
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(scan.keyword)}/@${pin.lat},${pin.lng},${scan.zoom}z`;
  return (
    <section className="panel flex flex-col w-full max-h-full min-h-0" aria-label="Google results at this point">
      <header className="flex items-start gap-3 p-4 border-b border-line">
        <div className="flex-1 min-w-0">
          <h3 className="text-[16px] font-extrabold tracking-tight">What Google shows here</h3>
          <p className="help mt-0.5">
            Someone searching “{scan.keyword}” {mi < 0.05 ? "at the center" : `${mi.toFixed(1)} miles from the center`}
            {business ? (
              <>
                {" "}sees{" "}
                {pin.rank == null ? <b className="text-ink">{business.name} outside the top 20</b> : <b className="text-ink">{business.name} at #{pin.rank}</b>}.
              </>
            ) : (
              " sees these businesses, in this order."
            )}
          </p>
        </div>
        <button onClick={onClose} className="btn btn-ghost !px-0 w-11 text-[20px]" aria-label="Close results">×</button>
      </header>
      {note}
      <ol className="overflow-y-auto scroll-thin p-2 min-h-0">
        {pin.items.length === 0 && <li className="p-3 help">Google returned no businesses at this point.</li>}
        {pin.items.map((it) => (
          <li key={it.rank + it.title} className={`flex gap-3 rounded-lg px-3 py-2.5 ${mine(it) ? "bg-accent/25 ring-2 ring-accent" : ""}`}>
            <span className="w-7 pt-0.5 text-right font-extrabold num text-[15px]" style={{ color: BUCKET_INK[bucket(it.rank)] }}>#{it.rank}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[14.5px] truncate" title={it.title}>{it.title}</div>
              <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                <Stars rating={it.rating} reviews={it.reviews} />
                {it.category && <span className="truncate">· {it.category}</span>}
              </div>
              {tag?.(it)}
            </div>
          </li>
        ))}
      </ol>
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="m-3 mt-1 btn btn-ghost text-[14px]">
        Open this search in Google Maps ↗
      </a>
    </section>
  );
}
