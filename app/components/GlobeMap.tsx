"use client";

import {
  AttributionControl,
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import type { FeatureCollection, Point } from "geojson";
import type { LineString } from "geojson";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { LifeEntry } from "../lib/types";

setWorkerUrl(workerUrl);

export type MapFocus = { lat: number; lng: number; zoom?: number };
export type MapLanguage = "zh" | "en";
export type MapVisualMode = "memory" | "real" | "minimal";
export type MapViewport = { lat: number; lng: number; zoom: number; bearing: number };

type Props = {
  entries: LifeEntry[];
  selectedId?: string;
  draftLocation: { lat: number; lng: number } | null;
  focus: MapFocus | null;
  language: MapLanguage;
  visualMode: MapVisualMode;
  onMapClick: (coordinates: { lat: number; lng: number }) => void;
  onEntrySelect: (id: string) => void;
  onZoomChange: (zoom: number) => void;
  onViewportChange: (viewport: MapViewport) => void;
};

type EntryProperties = {
  id: string;
  category: string;
  emotion: string;
  significance: number;
  selected: boolean;
  title: string;
};

function entriesGeoJson(entries: LifeEntry[], selectedId?: string): FeatureCollection<Point, EntryProperties> {
  return {
    type: "FeatureCollection",
    features: entries.map(entry => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [entry.longitude, entry.latitude] },
      properties: {
        id: entry.id,
        category: entry.category,
        emotion: entry.emotion || "calm",
        significance: Math.max(1, Math.min(5, entry.significance || 3)),
        selected: entry.id === selectedId,
        title: entry.title,
      },
    })),
  };
}

function graticuleGeoJson(): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>["features"] = [];
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const coordinates = Array.from({ length: 73 }, (_, index) => [-180 + index * 5, latitude]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });
  }
  for (let longitude = -180; longitude < 180; longitude += 30) {
    const coordinates = Array.from({ length: 33 }, (_, index) => [longitude, -80 + index * 5]);
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });
  }
  return { type: "FeatureCollection", features };
}

function greatCircle(from: LifeEntry, to: LifeEntry) {
  const radians = Math.PI / 180;
  const lat1 = from.latitude * radians;
  const lon1 = from.longitude * radians;
  const lat2 = to.latitude * radians;
  const lon2 = to.longitude * radians;
  const angle = Math.acos(Math.max(-1, Math.min(1,
    Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1),
  )));
  if (angle < 0.0001) return [[from.longitude, from.latitude], [to.longitude, to.latitude]];
  const divisor = Math.sin(angle);
  return Array.from({ length: 41 }, (_, index) => {
    const progress = index / 40;
    const a = Math.sin((1 - progress) * angle) / divisor;
    const b = Math.sin(progress * angle) / divisor;
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    return [Math.atan2(y, x) / radians, Math.atan2(z, Math.sqrt(x * x + y * y)) / radians];
  });
}

function routesGeoJson(entries: LifeEntry[]): FeatureCollection<LineString> {
  const ordered = [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  return {
    type: "FeatureCollection",
    features: ordered.slice(1).map((entry, index) => ({
      type: "Feature",
      properties: { from: ordered[index].id, to: entry.id },
      geometry: { type: "LineString", coordinates: greatCircle(ordered[index], entry) },
    })),
  };
}

const emotionColor: ExpressionSpecification = [
  "match", ["get", "emotion"],
  "joy", "#ffb46f",
  "excitement", "#ff8e59",
  "moved", "#f09bb1",
  "longing", "#b9a1dc",
  "sadness", "#7493b6",
  "regret", "#b5a4de",
  "anxiety", "#e7b56a",
  "anger", "#e77967",
  "loneliness", "#75899a",
  "confusion", "#a0a6a5",
  "relief", "#86ddb0",
  "#ff9a67",
];

const offlineWorldStyle: StyleSpecification = {
  version: 8,
  name: "Life Atlas Offline World",
  sources: {
    "offline-countries": { type: "geojson", data: "/offline/countries.json", attribution: "Natural Earth (public domain)" },
    "offline-cities": { type: "geojson", data: "/offline/cities.json" },
  },
  layers: [
    { id: "offline-ocean", type: "background", paint: { "background-color": "#06151b" } },
    { id: "offline-land", type: "fill", source: "offline-countries", paint: { "fill-color": ["match", ["get", "mapcolor"], 1, "#173b42", 2, "#1b4146", 3, "#15383f", 4, "#20454a", 5, "#193d43", 6, "#23484c", "#183b41"], "fill-opacity": 0.96 } },
    { id: "offline-country-border", type: "line", source: "offline-countries", paint: { "line-color": "#6d9496", "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 5, 0.9], "line-opacity": 0.58 } },
    { id: "place_country", type: "symbol", source: "offline-countries", minzoom: 0.7, maxzoom: 5.5, layout: { "text-field": ["coalesce", ["get", "name_zh"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 8, 4, 13], "text-letter-spacing": 0.06, "text-max-width": 8 }, paint: { "text-color": "#a9bfbd", "text-halo-color": "#07181d", "text-halo-width": 1.2, "text-opacity": 0.82 } },
    { id: "offline-city-major-dot", type: "circle", source: "offline-cities", filter: ["any", ["==", ["get", "capital"], 1], ["==", ["get", "worldcity"], 1], ["<=", ["get", "rank"], 2]], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.6, 6, 3.5], "circle-color": "#f09a70", "circle-stroke-color": "#fff0e5", "circle-stroke-width": 0.7, "circle-opacity": 0.9 } },
    { id: "place_city_major", type: "symbol", source: "offline-cities", minzoom: 1.8, filter: ["any", ["==", ["get", "capital"], 1], ["==", ["get", "worldcity"], 1], ["<=", ["get", "rank"], 2]], layout: { "text-field": ["coalesce", ["get", "local_name"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 2, 8, 7, 13], "text-offset": [0, 0.9], "text-anchor": "top", "text-optional": true, "symbol-sort-key": ["get", "rank"] }, paint: { "text-color": "#c6d5d2", "text-halo-color": "#07181d", "text-halo-width": 1.2 } },
    { id: "offline-city-dot", type: "circle", source: "offline-cities", minzoom: 4, filter: ["all", [">", ["get", "rank"], 2], ["<=", ["get", "rank"], 4]], paint: { "circle-radius": 2, "circle-color": "#8ebfc1", "circle-opacity": 0.82 } },
    { id: "place_city", type: "symbol", source: "offline-cities", minzoom: 4.5, filter: ["all", [">", ["get", "rank"], 2], ["<=", ["get", "rank"], 4]], layout: { "text-field": ["coalesce", ["get", "local_name"], ["get", "name"]], "text-size": 10, "text-offset": [0, 0.7], "text-anchor": "top", "text-optional": true, "symbol-sort-key": ["get", "rank"] }, paint: { "text-color": "#a9bfbd", "text-halo-color": "#07181d", "text-halo-width": 1 } },
  ],
};

function addPlanetLayers(map: Map, entries: LifeEntry[]) {
  if (map.getSource("earth-satellite")) return;
  const firstLabel = map.getStyle().layers?.find(layer => layer.type === "symbol")?.id;
  map.addSource("earth-satellite", {
    type: "raster",
    tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
    tileSize: 256,
    maxzoom: 12,
    attribution: "Sentinel-2 cloudless — EOX",
  });
  map.addLayer({
    id: "earth-satellite",
    type: "raster",
    source: "earth-satellite",
    maxzoom: 8.5,
    paint: {
      "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.76, 5, 0.58, 8, 0],
      "raster-saturation": -0.46,
      "raster-contrast": 0.22,
      "raster-brightness-min": 0.05,
      "raster-brightness-max": 0.68,
      "raster-fade-duration": 180,
    },
  }, firstLabel);
  map.addSource("orbital-grid", { type: "geojson", data: graticuleGeoJson() });
  map.addLayer({
    id: "orbital-grid-glow",
    type: "line",
    source: "orbital-grid",
    paint: { "line-color": "#79d9e2", "line-width": 1.8, "line-opacity": 0.04, "line-blur": 2.4 },
  }, firstLabel);
  map.addLayer({
    id: "orbital-grid",
    type: "line",
    source: "orbital-grid",
    paint: { "line-color": "#9adfe5", "line-width": 0.55, "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.22, 5, 0.1, 7, 0] },
  }, firstLabel);
  map.addSource("life-routes", { type: "geojson", data: routesGeoJson(entries), lineMetrics: true });
  map.addLayer({
    id: "life-route-glow",
    type: "line",
    source: "life-routes",
    paint: { "line-color": "#ff8f5e", "line-width": ["interpolate", ["linear"], ["zoom"], 0, 2.8, 8, 5], "line-opacity": 0.12, "line-blur": 3 },
  });
  map.addLayer({
    id: "life-route",
    type: "line",
    source: "life-routes",
    paint: {
      "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.75, 8, 1.6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.68, 8, 0.2],
      "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,150,101,0.08)", 0.42, "#ff9665", 1, "rgba(255,211,167,0.15)"],
    },
  });
}

function addEntryLayers(map: Map, entries: LifeEntry[], selectedId?: string) {
  if (map.getSource("life-entries")) return;
  map.addSource("life-entries", { type: "geojson", data: entriesGeoJson(entries, selectedId), cluster: true, clusterMaxZoom: 12, clusterRadius: 48 });
  map.addLayer({ id: "memory-cluster-glow", type: "circle", source: "life-entries", filter: ["has", "point_count"], paint: { "circle-radius": ["step", ["get", "point_count"], 16, 4, 23, 10, 31], "circle-color": "#ff9665", "circle-opacity": 0.16, "circle-blur": 0.75 } });
  map.addLayer({ id: "memory-cluster", type: "circle", source: "life-entries", filter: ["has", "point_count"], paint: { "circle-radius": ["step", ["get", "point_count"], 8, 4, 12, 10, 16], "circle-color": "#ff9665", "circle-stroke-width": 2, "circle-stroke-color": "#fff1e7", "circle-opacity": 0.92 } });
  map.addLayer({ id: "memory-cluster-count", type: "symbol", source: "life-entries", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 9 }, paint: { "text-color": "#132328" } });
  map.addLayer({
    id: "life-entry-glow",
    type: "circle",
    source: "life-entries",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 5, ["get", "significance"]], 8, ["+", 10, ["get", "significance"]], 16, ["+", 14, ["get", "significance"]]],
      "circle-color": emotionColor,
      "circle-opacity": 0.2,
      "circle-blur": 0.8,
    },
  });
  map.addLayer({
    id: "life-entry-dot",
    type: "circle",
    source: "life-entries",
    paint: {
      "circle-radius": ["case", ["boolean", ["get", "selected"], false], 8, ["+", 3, ["*", 0.55, ["get", "significance"]]]],
      "circle-color": emotionColor,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#f8f2e8",
      "circle-opacity": 0.96,
    },
  });
  map.addLayer({
    id: "life-entry-orbit",
    type: "circle",
    source: "life-entries",
    filter: ["==", ["get", "selected"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 14, 12, 24],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#ffc09d",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.72,
    },
  });
}

function applyVisualMode(map: Map, mode: MapVisualMode) {
  if (!map.getLayer("earth-satellite")) return;
  const satelliteOpacity: ExpressionSpecification = mode === "real"
    ? ["interpolate", ["linear"], ["zoom"], 0, 0.98, 5, 0.82, 8, 0]
    : mode === "minimal"
      ? ["literal", 0]
      : ["interpolate", ["linear"], ["zoom"], 0, 0.76, 5, 0.58, 8, 0];
  map.setPaintProperty("earth-satellite", "raster-opacity", satelliteOpacity);
  map.setPaintProperty("earth-satellite", "raster-saturation", mode === "real" ? -0.16 : -0.46);
  map.setLayoutProperty("earth-satellite", "visibility", mode === "minimal" ? "none" : "visible");
  map.setLayoutProperty("orbital-grid", "visibility", mode === "minimal" ? "none" : "visible");
  map.setLayoutProperty("orbital-grid-glow", "visibility", mode === "memory" ? "visible" : "none");
  map.setLayoutProperty("life-route", "visibility", mode === "memory" ? "visible" : "none");
  map.setLayoutProperty("life-route-glow", "visibility", mode === "memory" ? "visible" : "none");
  map.setPaintProperty("life-entry-glow", "circle-opacity", mode === "minimal" ? 0.08 : mode === "real" ? 0.14 : 0.2);
  map.setSky({
    "sky-color": mode === "real" ? "#010609" : "#020a0e",
    "horizon-color": mode === "minimal" ? "#0b2229" : "#123740",
    "fog-color": "#06151b",
    "sky-horizon-blend": mode === "minimal" ? 0.18 : 0.38,
    "horizon-fog-blend": 0.72,
    "fog-ground-blend": 0.14,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, mode === "minimal" ? 0.45 : 1, 5, 0.72, 7, 0],
  });
  map.setLight({ anchor: "map", color: mode === "real" ? "#d9efff" : "#9edbe2", intensity: mode === "minimal" ? 0.22 : 0.38, position: [1.25, 205, 42] });
}

function applyMapLanguage(map: Map, language: MapLanguage) {
  const expression: ExpressionSpecification = language === "zh"
    ? ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name:nonlatin"], ["get", "name"], ["get", "name_en"], ["get", "name:latin"]]
    : ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
  for (const layer of map.getStyle().layers || []) {
    const isNameLayer = layer.type === "symbol" && (layer.id === "water_name" || layer.id.startsWith("place_") || layer.id.startsWith("highway_name"));
    if (isNameLayer) map.setLayoutProperty(layer.id, "text-field", expression);
  }
}

export default function GlobeMap({ entries, selectedId, draftLocation, focus, language, visualMode, onMapClick, onEntrySelect, onZoomChange, onViewportChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const entriesRef = useRef(entries);
  const selectedIdRef = useRef(selectedId);
  const languageRef = useRef(language);
  const visualModeRef = useRef(visualMode);
  const callbacksRef = useRef({ onMapClick, onEntrySelect, onZoomChange, onViewportChange });

  useEffect(() => {
    entriesRef.current = entries;
    selectedIdRef.current = selectedId;
  }, [entries, selectedId]);

  useEffect(() => {
    callbacksRef.current = { onMapClick, onEntrySelect, onZoomChange, onViewportChange };
  }, [onMapClick, onEntrySelect, onZoomChange, onViewportChange]);

  useEffect(() => {
    languageRef.current = language;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyMapLanguage(map, language);
  }, [language]);

  useEffect(() => {
    visualModeRef.current = visualMode;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyVisualMode(map, visualMode);
  }, [visualMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: offlineWorldStyle,
      center: [104, 32],
      zoom: 1.45,
      minZoom: 0.7,
      maxZoom: 19,
      attributionControl: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      fadeDuration: 180,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    const detailedStyleUrl = "https://tiles.openfreemap.org/styles/fiord";
    const detailedStyleController = new AbortController();
    const detailedStyleTimer = window.setTimeout(() => detailedStyleController.abort(), 2600);
    fetch(detailedStyleUrl, { signal: detailedStyleController.signal })
      .then(response => { if (response.ok && mapRef.current === map) map.setStyle(detailedStyleUrl); })
      .catch(() => {})
      .finally(() => window.clearTimeout(detailedStyleTimer));

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      applyMapLanguage(map, languageRef.current);
      addPlanetLayers(map, entriesRef.current);
      addEntryLayers(map, entriesRef.current, selectedIdRef.current);
      applyVisualMode(map, visualModeRef.current);
    });
    map.on("click", event => {
      const layers = [map.getLayer("memory-cluster") ? "memory-cluster" : "", map.getLayer("life-entry-dot") ? "life-entry-dot" : ""].filter(Boolean);
      const features = map.queryRenderedFeatures(event.point, { layers });
      const clusterId = features[0]?.properties?.cluster_id as number | undefined;
      if (clusterId !== undefined) {
        const source = map.getSource("life-entries") as GeoJSONSource;
        void source.getClusterExpansionZoom(clusterId).then(expansionZoom => map.easeTo({ center: event.lngLat, zoom: expansionZoom, duration: 600 }));
        return;
      }
      const entryId = features[0]?.properties?.id as string | undefined;
      if (entryId) callbacksRef.current.onEntrySelect(entryId);
      else callbacksRef.current.onMapClick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    map.on("mousemove", event => {
      if (!map.getLayer("life-entry-dot")) return;
      const onEntry = map.queryRenderedFeatures(event.point, { layers: ["memory-cluster", "life-entry-dot"] }).length > 0;
      map.getCanvas().style.cursor = onEntry ? "pointer" : "crosshair";
    });
    const reportViewport = () => {
      const center = map.getCenter();
      const next = { lat: center.lat, lng: center.lng, zoom: map.getZoom(), bearing: map.getBearing() };
      callbacksRef.current.onZoomChange(next.zoom);
      callbacksRef.current.onViewportChange(next);
    };
    map.on("load", reportViewport);
    map.on("moveend", reportViewport);

    return () => { detailedStyleController.abort(); window.clearTimeout(detailedStyleTimer); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("life-entries") as GeoJSONSource | undefined;
    if (source) source.setData(entriesGeoJson(entries, selectedId));
    else addEntryLayers(map, entries, selectedId);
    const routeSource = map.getSource("life-routes") as GeoJSONSource | undefined;
    routeSource?.setData(routesGeoJson(entries));
  }, [entries, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? Math.max(map.getZoom(), 13), duration: 1400, essential: true });
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draftLocation) return;
    const marker = document.createElement("div");
    marker.className = "draft-map-marker";
    marker.setAttribute("aria-hidden", "true");
    const markerInstance = new Marker({ element: marker, anchor: "center" }).setLngLat([draftLocation.lng, draftLocation.lat]).addTo(map);
    return () => { markerInstance.remove(); };
  }, [draftLocation]);

  return <div className="globe-map" ref={containerRef} aria-label="可从地球缩放到街道的人生地图" />;
}
