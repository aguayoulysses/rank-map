"use client";

import { useMemo, useState } from "react";
import MapView, { type MapPin } from "@/components/MapView";
import { Competitors, PointResults, SummaryCard } from "@/components/ScanReport";
import { BrandMark, Legend, fmtDate } from "@/components/ui";
import { rippleDelay, scanRadiusMi } from "@/lib/grid";
import { businessKey } from "@/lib/insights";
import MarketReport from "@/components/MarketReport";
import { useBrand } from "@/components/BrandContext";
import type { Business, Pin, Scan } from "@/lib/db";

export default function ShareView({ business, scan, pins }: { business: Business; scan: Scan; pins: Pin[] }) {
  const brand = useBrand();
  const [sel, setSel] = useState<number | null>(null);
  const radius = scanRadiusMi(scan.shape, scan.layers, scan.spacingMi);
  const mapPins: MapPin[] = useMemo(
    () => pins.map((p) => ({ key: `p${p.idx}`, lat: p.lat, lng: p.lng, state: "ranked" as const, rank: p.rank, delay: 350 + rippleDelay({ lat: scan.centerLat, lng: scan.centerLng }, p, radius) })),
    [pins] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = pins.find((p) => p.idx === sel) ?? null;
  const by = (
    <span className="flex items-center gap-3 min-w-0">
      <BrandMark size={36} />
      <span className="leading-tight min-w-0">
        <span className="block text-[12.5px] text-[#c4c4cc]">Report by</span>
        <span className="block font-extrabold text-[15px] truncate">{brand.name}</span>
      </span>
    </span>
  );
  return (
    <main className="relative h-full">
      <MapView
        pins={mapPins}
        center={{ lat: scan.centerLat, lng: scan.centerLng }}
        selected={sel == null ? null : `p${sel}`}
        onPinClick={(k) => setSel(Number(k.slice(1)))}
        fitKey="share"
        focus={{ lat: scan.centerLat, lng: scan.centerLng, radiusMi: radius }}
        padding={{ top: 100, bottom: 80, left: 450, right: sel != null ? 430 : 80 }}
      />
      <header className="absolute top-0 inset-x-0 z-20 h-16 flex items-center justify-between gap-3 px-4 sm:px-5 bg-rail text-white">
        {brand.website ? (
          <a href={brand.website} target="_blank" rel="noreferrer" className="rounded-lg">{by}</a>
        ) : (
          by
        )}
        <span className="text-right leading-tight min-w-0">
          <span className="block font-bold text-[14.5px] truncate">Google Maps ranking report</span>
          <span className="block text-[12.5px] text-[#c4c4cc] truncate">“{scan.keyword}” · {fmtDate(scan.createdAt)}</span>
        </span>
      </header>
      <Legend className="absolute z-10 bottom-3 right-14 hidden sm:flex" />
      <div className="absolute z-10 left-3 right-3 bottom-3 max-h-[52%] sm:max-h-none sm:top-[76px] sm:right-auto sm:left-4 sm:w-[430px] flex flex-col gap-3 overflow-y-auto scroll-thin rounded-[14px]">
        <SummaryCard business={business} scan={scan} pins={pins} />
        <Competitors pins={pins} meKey={businessKey(business)} />
        <p className="panel px-4 py-3 text-[14px]"><b>Tip:</b> click any pin on the map to see exactly what Google shows there.</p>
      </div>
      {selected && (
        <div className="absolute z-20 inset-x-3 bottom-3 max-h-[60%] sm:inset-x-auto sm:right-3 sm:top-[76px] sm:bottom-3 sm:max-h-none sm:w-[400px] flex">
          <PointResults business={business} scan={scan} pin={selected} onClose={() => setSel(null)} />
        </div>
      )}
    </main>
  );
}

export function ShareMarket({ scan, pins }: { scan: Scan; pins: Pin[] }) {
  const brand = useBrand();
  return (
    <MarketReport
      scan={scan}
      pins={pins}
      top={
        <header className="absolute top-0 inset-x-0 z-20 h-16 flex items-center justify-between gap-3 px-4 sm:px-5 bg-rail text-white">
          <span className="flex items-center gap-3 min-w-0">
            <BrandMark size={36} />
            <span className="leading-tight min-w-0">
              <span className="block text-[12.5px] text-[#c4c4cc]">Report by</span>
              <span className="block font-extrabold text-[15px] truncate">{brand.name}</span>
            </span>
          </span>
          <span className="text-right leading-tight min-w-0">
            <span className="block font-bold text-[14.5px] truncate">Local market report</span>
            <span className="block text-[12.5px] text-[#c4c4cc] truncate">{scan.label} · {fmtDate(scan.createdAt)}</span>
          </span>
        </header>
      }
    />
  );
}
