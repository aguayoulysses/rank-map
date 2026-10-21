import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

// Recolors the free OpenFreeMap "liberty" style into a calm, Google-Maps-like
// basemap (soft gray land, white streets, pale yellow highways, sky-blue water)
// and strips POI clutter so the rank pins carry the page. Free to use
// commercially, so it is safe for white-label resellers.

export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const C = {
  land: "#f3f4f1",
  residential: "#eceeeb",
  park: "#cfe9d4",
  wood: "#d6ecd8",
  water: "#a9d3f5",
  waterLabel: "#3f6f9e",
  building: "#e6e7e9",
  buildingLine: "#d9dbde",
  motorway: "#f8d688",
  motorwayCase: "#e2b75e",
  major: "#fdeebd",
  majorCase: "#e6d29a",
  street: "#ffffff",
  streetCase: "#dcdfe3",
  rail: "#c9ccd1",
  label: "#3c4043",
  roadLabel: "#5f6368",
  halo: "#ffffff",
};

const DROP = /^(natural_earth|building-3d|poi_r\d+|poi_transit|park_outline|road_one_way_arrow|landcover_wetland|road_area_pattern)/;

function setPaint(l: LayerSpecification, key: string, value: unknown) {
  (l as unknown as { paint: Record<string, unknown> }).paint ??= {};
  (l as unknown as { paint: Record<string, unknown> }).paint[key] = value;
}

export function googleish(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const layer of style.layers) {
    const id = layer.id;
    if (DROP.test(id)) continue;
    const l = layer;
    if (id === "background") setPaint(l, "background-color", C.land);
    else if (id === "landuse_residential") {
      setPaint(l, "fill-color", C.residential);
      setPaint(l, "fill-opacity", 0.7);
    } else if (id === "park" || id === "landcover_grass") {
      setPaint(l, "fill-color", C.park);
      setPaint(l, "fill-opacity", 0.9);
      if (id === "park") setPaint(l, "fill-outline-color", C.park);
    } else if (id === "landcover_wood") {
      setPaint(l, "fill-color", C.wood);
      setPaint(l, "fill-opacity", 0.8);
    } else if (/^landuse_(pitch|track|cemetery|hospital|school)$/.test(id)) setPaint(l, "fill-color", "#e9ebe6");
    else if (id === "water") setPaint(l, "fill-color", C.water);
    else if (id.startsWith("waterway") && l.type === "line") setPaint(l, "line-color", C.water);
    else if (id === "building") {
      setPaint(l, "fill-color", C.building);
      setPaint(l, "fill-outline-color", C.buildingLine);
    } else if (/(^|_)(tunnel|road|bridge)_/.test(id) && l.type === "line") {
      const casing = id.endsWith("_casing");
      let color: string;
      if (/motorway/.test(id)) color = casing ? C.motorwayCase : C.motorway;
      else if (/trunk_primary|link/.test(id)) color = casing ? C.majorCase : C.major;
      else if (/secondary_tertiary/.test(id)) color = casing ? C.streetCase : C.street;
      else if (/rail/.test(id)) color = C.rail;
      else if (/path_pedestrian/.test(id)) color = casing ? C.streetCase : "#f7f7f5";
      else color = casing ? C.streetCase : C.street;
      setPaint(l, "line-color", color);
      if (id.startsWith("tunnel_")) setPaint(l, "line-opacity", 0.5);
    } else if (l.type === "symbol") {
      if (id.startsWith("water") ) {
        setPaint(l, "text-color", C.waterLabel);
        setPaint(l, "text-halo-color", "rgba(255,255,255,0.8)");
      } else if (id.startsWith("highway-name")) {
        setPaint(l, "text-color", C.roadLabel);
        setPaint(l, "text-halo-color", C.halo);
        setPaint(l, "text-halo-width", 1.2);
      } else if (id.startsWith("label_") || id === "airport") {
        setPaint(l, "text-color", id === "label_other" ? "#70757a" : C.label);
        setPaint(l, "text-halo-color", C.halo);
        setPaint(l, "text-halo-width", 1.6);
        setPaint(l, "text-halo-blur", 0.4);
      }
    }
    layers.push(l);
  }
  return { ...style, layers };
}
