"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BUCKET_COLOR, BUCKET_LABEL, BUCKET_TEXT, bucket } from "@/lib/grid";
import type { Pin } from "@/lib/db";
import { useBrand } from "./BrandContext";

const TABS = [
  { href: "/", label: "Businesses", match: (p: string) => p === "/" || p.startsWith("/b/") },
  { href: "/market", label: "Market research", match: (p: string) => p.startsWith("/market") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

export function TopBar({ showBalance = true }: { showBalance?: boolean }) {
  const brand = useBrand();
  const path = usePathname() ?? "/";
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => {
    if (!showBalance) return;
    fetch("/api/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBal(d.balance))
      .catch(() => {});
  }, [showBalance]);
  return (
    <header className="absolute top-0 inset-x-0 z-20 h-16 flex items-center justify-between gap-3 px-4 sm:px-5 bg-rail text-white">
      <Link href="/" className="flex items-center gap-3 min-w-0 rounded-lg" aria-label={`${brand.product} home`}>
        <BrandMark />
        <span className="min-w-0 leading-tight">
          <span className="block font-extrabold text-[16px] tracking-tight truncate">{brand.product}</span>
          <span className="hidden sm:block text-[12.5px] text-[#c4c4cc] truncate">by {brand.name}</span>
        </span>
      </Link>
      <nav aria-label="Main" className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-1">
        {TABS.map((tab) => {
          const on = tab.match(path);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={`relative px-3.5 py-2 rounded-lg text-[14.5px] font-semibold transition-colors ${on ? "text-white" : "text-[#c4c4cc] hover:text-white hover:bg-white/10"}`}
            >
              {tab.label}
              {on && <span className="absolute left-3.5 right-3.5 -bottom-[11px] h-[3px] rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Main" className="md:hidden flex items-center gap-0.5 text-[13px] font-semibold">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={tab.match(path) ? "page" : undefined} className={`px-2 py-2 rounded-md ${tab.match(path) ? "text-accent" : "text-[#d4d4d8]"}`}>
            {tab.label === "Market research" ? "Research" : tab.label}
          </Link>
        ))}
      </nav>
      {showBalance && (
        <span className="hidden md:inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-[13.5px] font-semibold" title="Money left in the DataForSEO account that pays for scans">
          <span className="hidden sm:inline text-[#d4d4d8]">Scan balance</span>
          <span className="num">{bal == null ? "…" : `$${bal.toFixed(2)}`}</span>
        </span>
      )}
    </header>
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  const brand = useBrand();
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brand.mark} alt="" width={size} height={size} className="shrink-0 rounded-xl bg-white p-0.5" style={{ width: size, height: size }} />;
}

export function RankChip({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  const b = value == null ? "none" : bucket(Math.round(value));
  const text = value == null ? "No data" : value > 20 ? "Not ranked" : Number.isInteger(value) ? `#${value}` : value.toFixed(1);
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold num whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-[15px]" : "px-2.5 py-0.5 text-[13px]"}`}
      style={{ background: value == null ? "#a1a1aa" : BUCKET_COLOR[b], color: value == null ? "#fff" : BUCKET_TEXT[b] }}
    >
      {text}
    </span>
  );
}

export function Stars({ rating, reviews }: { rating: number | null; reviews: number | null }) {
  if (rating == null) return <span className="text-muted text-[13px]">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13.5px]" aria-label={`${rating.toFixed(1)} stars from ${reviews ?? 0} reviews`}>
      <span className="font-bold num">{rating.toFixed(1)}</span>
      <span className="text-[#e5a000] tracking-[-1px]" aria-hidden>
        {"★★★★★".slice(0, Math.round(rating))}
        <span className="text-[#d4d4d8]">{"★★★★★".slice(Math.round(rating))}</span>
      </span>
      <span className="text-muted num" aria-hidden>({reviews ?? 0})</span>
    </span>
  );
}

export function counts(pins: Pin[]) {
  const c = { good: 0, medium: 0, bad: 0, none: 0 };
  for (const p of pins) c[bucket(p.rank)]++;
  return c;
}

export function Donut({ pins, size = 132 }: { pins: Pin[]; size?: number }) {
  const c = counts(pins);
  const total = pins.length || 1;
  const r = 15.9155;
  let acc = 0;
  const segs = (["good", "medium", "bad", "none"] as const).map((k) => {
    const pct = (c[k] / total) * 100;
    const seg = { k, pct, off: acc };
    acc += pct;
    return seg;
  });
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label={`${Math.round((c.good / total) * 100)}% of points in the top 3`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="#efefec" strokeWidth="6.5" />
      {segs.map((s) =>
        s.pct > 0 ? (
          <circle key={s.k} cx="21" cy="21" r={r} fill="none" stroke={BUCKET_COLOR[s.k]} strokeWidth="6.5" strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset={25 - s.off} />
        ) : null
      )}
      <text x="21" y="21.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#18181b">
        {Math.round((c.good / total) * 100)}%
      </text>
      <text x="21" y="27" textAnchor="middle" fontSize="3.4" fontWeight="700" fill="#5f5f68">
        in top 3
      </text>
    </svg>
  );
}

/** Color key, shown on the map so nobody has to guess what the pin colors mean. */
export function Legend({ className = "" }: { className?: string }) {
  return (
    <div className={`panel px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-semibold ${className}`} role="note" aria-label="Pin color key">
      {(["good", "medium", "bad", "none"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: BUCKET_COLOR[k] }} />
          {BUCKET_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

export function fmtDate(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
