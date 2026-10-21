"use client";

import { useEffect, useRef } from "react";
import type { Map as MLMap, Marker, StyleSpecification, GeoJSONSource } from "maplibre-gl";
import { BUCKET_COLOR, BUCKET_TEXT, bucket } from "@/lib/grid";
import { BASE_STYLE_URL, googleish } from "@/lib/mapStyle";

export type PinState = "preview" | "water" | "pending" | "ranked" | "place";

export interface MapPin {
  key: string;
  lat: number;
  lng: number;
  state: PinState;
  rank?: number | null;
  label?: string;
  /** ms to wait before the drop-in animation, for a ripple out from the center */
  delay?: number;
  /** override the rank colors (competitor lens, difficulty view) */
  color?: string;
  ink?: string;
  /** text inside the pin instead of the rank */
  text?: string;
  /** positions gained (+) or lost (-) since the last scan */
  delta?: number | null;
  /** point left out of the scan by the user */
  off?: boolean;
  /** the scan point sitting on the business itself: drawn as a round badge over the storefront */
  isCenter?: boolean;
}

type Kind = "pin" | "star" | "disc" | "flat";

/** Marker styles: #1 is a star, the point on the business is a round badge, everything else a map pin. */
function kindOf(p: MapPin): Kind {
  if (p.state !== "ranked") return "flat";
  if (p.isCenter) return "disc";
  if (p.rank === 1 && !p.color) return "star";
  return "pin";
}

const STAR = "M20 2.5l5.2 11.1 12.1 1.5-8.9 8.3 2.3 12-10.7-5.9-10.7 5.9 2.3-12-8.9-8.3 12.1-1.5z";

// Google Business Profile style storefront: scalloped two-tone awning over a blue shop
const STOREFRONT = `<svg viewBox="0 0 56 50" aria-hidden="true">
  <rect x="7" y="17" width="42" height="30" rx="3" fill="#4285f4"/>
  <rect x="7" y="17" width="42" height="30" rx="3" fill="url(#hxStoreShade)"/>
  <defs><linearGradient id="hxStoreShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".35" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
  <rect x="31" y="29" width="11" height="18" rx="1.5" fill="#fff" fill-opacity=".92"/>
  <rect x="13" y="29" width="13" height="10" rx="1.5" fill="#fff" fill-opacity=".92"/>
  <path d="M4 6.5C4 4.6 5.6 3 7.5 3h41C50.4 3 52 4.6 52 6.5V15H4z" fill="#1a73e8"/>
  <path d="M4 15a6 6 0 0 0 12 0V3H8a4 4 0 0 0-4 4z" fill="#1a73e8"/>
  <path d="M16 15a6 6 0 0 0 12 0V3H16z" fill="#8ab4f8"/>
  <path d="M28 15a6 6 0 0 0 12 0V3H28z" fill="#1a73e8"/>
  <path d="M40 15a6 6 0 0 0 12 0V7a4 4 0 0 0-4-4h-8z" fill="#8ab4f8"/>
</svg>`;

interface Props {
  pins: MapPin[];
  center?: { lat: number; lng: number } | null;
  /** GBP pin, shown as a small marker when it differs from the scan center */
  gbp?: { lat: number; lng: number } | null;
  draggableCenter?: boolean;
  onCenterDrag?: (c: { lat: number; lng: number }) => void;
  selected?: string | null;
  onPinClick?: (key: string) => void;
  /** change this to re-fit the camera to pins + center */
  fitKey?: string;
  padding?: { top: number; bottom: number; left: number; right: number };
  /** called after a fit with the keys of preview pins that sit on water */
  onWater?: (keys: string[]) => void;
  /** what marks the center: the business storefront, or a plain place marker for market research */
  centerIcon?: "store" | "place";
  /** dims everything outside this circle, like a spotlight on the scan area */
  focus?: { lat: number; lng: number; radiusMi: number } | null;
}

let styleP: Promise<StyleSpecification | string> | null = null;
function loadStyle() {
  styleP ??= fetch(BASE_STYLE_URL)
    .then((r) => r.json())
    .then((s: StyleSpecification) => googleish(s))
    .catch(() => BASE_STYLE_URL);
  return styleP;
}

function circleRing(c: { lat: number; lng: number }, mi: number, n = 96) {
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([c.lng + (mi * Math.cos(a)) / (69 * Math.cos((c.lat * Math.PI) / 180)), c.lat + (mi * Math.sin(a)) / 69]);
  }
  return ring;
}

function pinHtml(p: MapPin, selected: boolean) {
  if (p.state === "preview" || p.state === "water" || p.state === "pending") {
    return `<div class="hx-dot hx-${p.off ? "off" : p.state}${selected ? " sel" : ""}"></div>`;
  }
  if (p.state === "place") {
    return `<div class="hx-place${selected ? " sel" : ""}"><span>${p.label ?? ""}</span></div>`;
  }
  const b = bucket(p.rank ?? null);
  const fill = p.color ?? BUCKET_COLOR[b];
  const ink = p.ink ?? BUCKET_TEXT[b];
  const text = p.text ?? (p.rank == null ? "20+" : String(p.rank));
  const kind = kindOf(p);
  const delta =
    p.delta != null && p.delta !== 0
      ? `<span class="hx-delta ${p.delta > 0 ? "up" : "down"}">${p.delta > 0 ? "▲" : "▼"}${Math.abs(p.delta)}</span>`
      : "";
  const shape =
    kind === "star"
      ? `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="hx-shape" d="${STAR}" stroke-linejoin="round"/></svg>`
      : kind === "disc"
        ? `<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="hx-shape hx-disc" cx="20" cy="20" r="17"/></svg>`
        : `<svg viewBox="0 0 40 52" aria-hidden="true">
        <defs><linearGradient id="hxShine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
        <path class="hx-shape" d="M20 50.5C18.6 45.6 3 34.4 3 20.5a17 17 0 1 1 34 0C37 34.4 21.4 45.6 20 50.5z"/>
        <path d="M20 50.5C18.6 45.6 3 34.4 3 20.5a17 17 0 1 1 34 0C37 34.4 21.4 45.6 20 50.5z" fill="url(#hxShine)"/>
      </svg>`;
  return `<div class="hx-pin hx-k-${kind}${selected ? " sel" : ""}" style="--c:${kind === "star" ? "#1f7a35" : fill};--i:${ink};--d:${p.delay ?? 0}ms">
    ${kind === "pin" ? '<span class="hx-ground"></span>' : ""}
    <span class="hx-body">${shape}<b class="${text.length > 2 ? "sm" : ""}">${text}</b>${delta}</span>
  </div>`;
}

export default function MapView({ pins, center, gbp, draggableCenter, onCenterDrag, selected, onPinClick, fitKey, padding, onWater, focus, centerIcon = "store" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new Map<string, { m: Marker; html: string; kind: Kind }>());
  const centerMarker = useRef<Marker | null>(null);
  const gbpMarker = useRef<Marker | null>(null);
  const loaded = useRef<Promise<void> | null>(null);
  const cb = useRef({ onCenterDrag, onPinClick, onWater });
  cb.current = { onCenterDrag, onPinClick, onWater };
  const latest = useRef({ pins, center, padding });
  latest.current = { pins, center, padding };

  // create the map once
  useEffect(() => {
    let dead = false;
    loaded.current = (async () => {
      const mod = await import("maplibre-gl");
      const ml = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      if (dead || !box.current) return;
      lib.current = ml;
      const c = latest.current.center ?? { lat: 33.85, lng: -117.79 };
      const style = await loadStyle();
      if (dead || !box.current) return;
      const m = new ml.Map({ container: box.current, style, center: [c.lng, c.lat], zoom: 11.5, attributionControl: { compact: true }, fadeDuration: 0 });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      map.current = m;
      // keep the canvas matched to its box (layout can settle after the map is created)
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(box.current);
      m.once("remove", () => ro.disconnect());
      await new Promise<void>((r) => m.once("load", () => r()));
      m.resize();
      // soft rank-colored glow under the pins + spotlight mask, both below the place labels
      const firstLabel = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addSource("hx-glow", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer(
        {
          id: "hx-glow",
          type: "circle",
          source: "hx-glow",
          paint: {
            "circle-color": ["get", "c"],
            "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 9, 10, 12, 42, 14, 150],
            "circle-blur": 1,
            "circle-opacity": 0.32,
          },
        },
        firstLabel
      );
      m.addSource("hx-focus", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "hx-focus-dim", type: "fill", source: "hx-focus", filter: ["==", ["get", "k"], "dim"], paint: { "fill-color": "#1f2937", "fill-opacity": 0.13 } }, firstLabel);
      m.addLayer({ id: "hx-focus-edge", type: "line", source: "hx-focus", filter: ["==", ["get", "k"], "edge"], paint: { "line-color": "#18181b", "line-opacity": 0.35, "line-width": 1.5, "line-dasharray": [3, 3] } }, firstLabel);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      centerMarker.current = null;
      gbpMarker.current = null;
    };
  }, []);

  // sync pins
  useEffect(() => {
    loaded.current?.then(() => {
      const m = map.current;
      const ml = lib.current;
      if (!m || !ml) return;
      const seen = new Set<string>();
      const near = (q: MapPin) => !!center && Math.abs(q.lat - center.lat) < 0.0003 && Math.abs(q.lng - center.lng) < 0.0003;
      for (const raw of pins) {
        const p = raw.isCenter === undefined && raw.state === "ranked" && near(raw) ? { ...raw, isCenter: true } : raw;
        seen.add(p.key);
        const html = pinHtml(p, p.key === selected);
        let cur = markers.current.get(p.key);
        if (cur && cur.kind !== kindOf(p)) {
          // anchor changes with the shape (pins stand on their tip, stars sit centered): rebuild
          cur.m.remove();
          markers.current.delete(p.key);
          cur = undefined;
        }
        if (cur) {
          cur.m.setLngLat([p.lng, p.lat]);
          if (cur.html !== html) {
            // already on the map: swap in place without replaying the drop-in
            cur.m.getElement().innerHTML = cur.html.includes("hx-pin") ? html.replace('class="hx-pin', 'class="hx-pin settled') : html;
            cur.html = html;
          }
          cur.m.getElement().style.zIndex = p.key === selected ? "6" : p.isCenter ? "4" : p.state === "ranked" && p.rank != null && p.rank <= 3 ? "3" : "2";
          continue;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.className = "hx-marker";
        el.innerHTML = html;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          cb.current.onPinClick?.(p.key);
        });
        const anchor = kindOf(p) === "pin" ? "bottom" : "center";
        const mk = new ml.Marker({ element: el, anchor }).setLngLat([p.lng, p.lat]).addTo(m);
        el.style.zIndex = p.key === selected ? "6" : p.isCenter ? "4" : p.state === "ranked" && p.rank != null && p.rank <= 3 ? "3" : "2";
        markers.current.set(p.key, { m: mk, html, kind: kindOf(p) });
      }
      for (const [k, v] of markers.current) if (!seen.has(k)) {
        v.m.remove();
        markers.current.delete(k);
      }
    });
  }, [pins, selected, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // glow follows the ranked pins
  useEffect(() => {
    loaded.current?.then(() => {
      const src = map.current?.getSource("hx-glow") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: pins
          .filter((p) => p.state === "ranked")
          .map((p) => ({ type: "Feature", properties: { c: p.color ?? BUCKET_COLOR[bucket(p.rank ?? null)] }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
      });
    });
  }, [pins]);

  // spotlight on the scan area
  useEffect(() => {
    loaded.current?.then(() => {
      const src = map.current?.getSource("hx-focus") as GeoJSONSource | undefined;
      if (!src) return;
      if (!focus) return src.setData({ type: "FeatureCollection", features: [] });
      const ring = circleRing(focus, focus.radiusMi);
      const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      src.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { k: "dim" }, geometry: { type: "Polygon", coordinates: [world, [...ring].reverse()] } },
          { type: "Feature", properties: { k: "edge" }, geometry: { type: "LineString", coordinates: ring } },
        ],
      });
    });
  }, [focus?.lat, focus?.lng, focus?.radiusMi]); // eslint-disable-line react-hooks/exhaustive-deps

  // center (home base) marker
  useEffect(() => {
    loaded.current?.then(() => {
      const m = map.current;
      const ml = lib.current;
      if (!m || !ml) return;
      if (!center) {
        centerMarker.current?.remove();
        centerMarker.current = null;
        return;
      }
      if (!centerMarker.current) {
        const el = document.createElement("div");
        el.className = "hx-center";
        el.title = centerIcon === "store" ? "Business location (home base)" : "Center of the research area";
        if (centerIcon === "place") {
          el.innerHTML = `<div class="hx-center-tip">Drag to move</div><div class="hx-place-dot"></div>`;
        } else if (draggableCenter) {
          el.innerHTML = `<div class="hx-center-tip">Drag to move</div><div class="hx-store">${STOREFRONT}</div><div class="hx-store-dot"></div>`;
        } else {
          // results view: storefront sits behind the center rank badge
          el.className = "hx-center static";
          el.innerHTML = `<div class="hx-store">${STOREFRONT}</div>`;
          el.style.zIndex = "1";
        }
        const mk = new ml.Marker({ element: el, anchor: draggableCenter && centerIcon === "store" ? "bottom" : "center", offset: draggableCenter || centerIcon === "place" ? [0, 0] : [-24, -4], draggable: !!draggableCenter }).setLngLat([center.lng, center.lat]).addTo(m);
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          cb.current.onCenterDrag?.({ lat: ll.lat, lng: ll.lng });
        });
        centerMarker.current = mk;
      } else {
        centerMarker.current.setLngLat([center.lng, center.lat]);
        centerMarker.current.setDraggable(!!draggableCenter);
      }
      centerMarker.current.getElement().classList.toggle("draggable", !!draggableCenter);
    });
  }, [center?.lat, center?.lng, draggableCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  // GBP marker, only when it is meaningfully away from the scan center
  useEffect(() => {
    loaded.current?.then(() => {
      const m = map.current;
      const ml = lib.current;
      if (!m || !ml) return;
      gbpMarker.current?.remove();
      gbpMarker.current = null;
      if (!gbp || (center && Math.abs(gbp.lat - center.lat) < 0.0005 && Math.abs(gbp.lng - center.lng) < 0.0005)) return;
      const el = document.createElement("div");
      el.className = "hx-gbp";
      el.title = "Where Google shows the listing";
      el.innerHTML = "<span>G</span>";
      gbpMarker.current = new ml.Marker({ element: el, anchor: "center" }).setLngLat([gbp.lng, gbp.lat]).addTo(m);
    });
  }, [gbp?.lat, gbp?.lng, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // fit camera, then check which preview pins sit on water
  useEffect(() => {
    if (!fitKey) return;
    loaded.current?.then(() => {
      const m = map.current;
      const ml = lib.current;
      if (!m || !ml) return;
      const { pins: ps, center: c, padding: pad } = latest.current;
      const pts = ps.map((p) => [p.lng, p.lat] as [number, number]);
      if (c) pts.push([c.lng, c.lat]);
      if (!pts.length) return;
      const bounds = pts.reduce((b, p) => b.extend(p), new ml.LngLatBounds(pts[0], pts[0]));
      const p = pad ?? { top: 60, bottom: 60, left: 60, right: 60 };
      const w = m.getContainer().clientWidth;
      const h = m.getContainer().clientHeight;
      const fits = p.left + p.right < w - 160 && p.top + p.bottom < h - 160;
      // ranked pins stand ~44px above their point, so leave that room at the top
      const lift = ps.some((x) => x.state === "ranked") ? 50 : ps.some((x) => x.state === "place") ? 20 : 0;
      m.fitBounds(bounds, { padding: fits ? { ...p, top: p.top + lift } : 40 + lift, maxZoom: 14, duration: 600 });
      if (!cb.current.onWater) return;
      m.once("idle", () => {
        const style = m.getStyle();
        const waterLayers = (style.layers ?? [])
          .filter((l) => l.type === "fill" && "source-layer" in l && l["source-layer"] === "water")
          .map((l) => l.id);
        if (!waterLayers.length) return;
        const wet: string[] = [];
        for (const pin of latest.current.pins) {
          if (pin.state !== "preview" && pin.state !== "water") continue;
          const pt = m.project([pin.lng, pin.lat]);
          if (pt.x < 0 || pt.y < 0 || pt.x > w || pt.y > h) continue;
          if (m.queryRenderedFeatures([pt.x, pt.y], { layers: waterLayers }).length) wet.push(pin.key);
        }
        cb.current.onWater?.(wet);
      });
    });
  }, [fitKey]);

  // maplibre sets position: relative on its container, so the sizing lives on a wrapper
  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" />
    </div>
  );
}
