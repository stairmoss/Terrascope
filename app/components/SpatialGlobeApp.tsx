"use client";

import L from "leaflet";
import {
  AlertTriangle,
  Building2,
  Copy,
  Crosshair,
  Download,
  Factory,
  Gauge,
  Layers,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Share2,
  Sprout,
  SunMoon,
  Wind,
  ZoomIn
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Coordinates, LocationAudit } from "@/lib/types";

type TabKey = "residential" | "industrial" | "agriculture";
type MapLayer = "map" | "satellite";
type MapAppearance = "day" | "night" | "auto";
type RecentLocation = Coordinates & { label: string };

const QUICK_TARGETS = [
  { label: "Kerala", lat: 10.8505, lng: 76.2711, zoom: 13 },
  { label: "Nile Delta", lat: 30.8025, lng: 31.2122, zoom: 12 },
  { label: "California", lat: 36.7783, lng: -119.4179, zoom: 10 }
];

const LAYERS = {
  map: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors"
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  }
} satisfies Record<MapLayer, { url: string; attribution: string }>;

const NIGHT_MAP = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
};

const SATELLITE_LABELS = {
  url: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
};

export default function SpatialGlobeApp() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const labelRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const radiusRef = useRef<L.Circle | null>(null);
  const [selected, setSelected] = useState<Coordinates | null>(null);
  const [audit, setAudit] = useState<LocationAudit | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("residential");
  const [layer, setLayer] = useState<MapLayer>("map");
  const [appearance, setAppearance] = useState<MapAppearance>("auto");
  const [zoom, setZoom] = useState(5);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  }, []);

  const updateMarker = useCallback((coords: Coordinates) => {
    const map = mapRef.current;
    if (!map) return;

    const icon = L.divIcon({
      className: "satellite-pin",
      html: "<span></span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([coords.lat, coords.lng], { icon }).addTo(map);
    } else {
      markerRef.current.setLatLng([coords.lat, coords.lng]);
    }

    if (!radiusRef.current) {
      radiusRef.current = L.circle([coords.lat, coords.lng], {
        radius: 10_000,
        color: "#2563eb",
        weight: 1.5,
        fillColor: "#3b82f6",
        fillOpacity: 0.06,
        interactive: false
      }).addTo(map);
    } else {
      radiusRef.current.setLatLng([coords.lat, coords.lng]);
    }
  }, []);

  const runAudit = useCallback(async (coords: Coordinates, targetZoom = 14) => {
    setSelected(coords);
    setAudit(null);
    setError(null);
    setIsLoading(true);
    setActiveTab("residential");
    updateMarker(coords);
    mapRef.current?.flyTo([coords.lat, coords.lng], Math.max(targetZoom, mapRef.current.getZoom()), { duration: 0.8 });

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Location analysis failed.");
      const nextAudit = payload as LocationAudit;
      setAudit(nextAudit);
      const recent = { ...coords, label: nextAudit.placeName || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` };
      setRecentLocations((items) => {
        const updated = [recent, ...items.filter((item) => Math.abs(item.lat - coords.lat) > 0.0001 || Math.abs(item.lng - coords.lng) > 0.0001)].slice(0, 4);
        try {
          window.localStorage.setItem("geoaudit-recent-locations", JSON.stringify(updated));
        } catch {
          // The audit remains usable when browser storage is unavailable.
        }
        return updated;
      });
      const url = new URL(window.location.href);
      url.searchParams.set("lat", coords.lat.toFixed(5));
      url.searchParams.set("lng", coords.lng.toFixed(5));
      window.history.replaceState({}, "", url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Location analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }, [updateMarker]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = L.map(mapEl.current, {
      center: [18, 76],
      zoom: 5,
      minZoom: 2,
      maxZoom: 20,
      zoomControl: false,
      worldCopyJump: true
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    tileRef.current = L.tileLayer(LAYERS.map.url, {
      attribution: LAYERS.map.attribution,
      maxZoom: 20
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      void runAudit({ lat: event.latlng.lat, lng: event.latlng.lng }, Math.max(14, map.getZoom() + 1));
    });
    map.on("zoomend", () => setZoom(map.getZoom()));

    mapRef.current = map;
    setMapReady(true);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      labelRef.current = null;
      markerRef.current = null;
      radiusRef.current = null;
      setMapReady(false);
    };
  }, [runAudit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const isNight = appearance === "night" || (appearance === "auto" && (new Date().getHours() >= 18 || new Date().getHours() < 6));
    const source = layer === "map" && isNight ? NIGHT_MAP : LAYERS[layer];
    tileRef.current = L.tileLayer(source.url, {
      attribution: source.attribution,
      maxZoom: 20
    }).addTo(map);
    if (layer === "satellite") {
      labelRef.current = L.tileLayer(SATELLITE_LABELS.url, {
        attribution: SATELLITE_LABELS.attribution,
        maxZoom: 20,
        opacity: 0.9
      }).addTo(map);
    } else {
      labelRef.current?.remove();
      labelRef.current = null;
    }
  }, [appearance, layer]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("geoaudit-recent-locations");
      if (stored) setRecentLocations(JSON.parse(stored) as RecentLocation[]);
    } catch {
      // Browser storage is optional for recent locations.
    }
  }, []);

  useEffect(() => {
    if (!mapReady || selected) return;
    const params = new URLSearchParams(window.location.search);
    const latValue = params.get("lat");
    const lngValue = params.get("lng");
    if (latValue === null || lngValue === null) return;
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      void runAudit({ lat, lng }, 14);
    }
  }, [mapReady, runAudit, selected]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const match = query.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
    if (!match) {
      try {
        setError(null);
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const result = await response.json() as { lat?: number; lng?: number; error?: string };
        if (!response.ok || typeof result.lat !== "number" || typeof result.lng !== "number") throw new Error(result.error ?? "Place search failed.");
        void runAudit({ lat: result.lat, lng: result.lng }, 15);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Place search failed.");
      }
      return;
    }

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Those coordinates are outside the valid map range.");
      return;
    }

    void runAudit({ lat, lng }, 15);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Current location is not available in this browser.");
      return;
    }

    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void runAudit({ lat: position.coords.latitude, lng: position.coords.longitude }, 15);
      },
      () => setError("Location permission was not granted."),
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const copyCoordinates = async () => {
    if (!selected) return;
    await navigator.clipboard?.writeText(`${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`);
    showNotice("Coordinates copied");
  };

  const shareLocation = async () => {
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("lat", selected.lat.toFixed(5));
    url.searchParams.set("lng", selected.lng.toFixed(5));
    const shareData = { title: "GeoAudit location", text: `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`, url: url.toString() };
    if (navigator.share) {
      await navigator.share(shareData);
      showNotice("Location shared");
    } else {
      await navigator.clipboard?.writeText(url.toString());
      showNotice("Share link copied");
    }
  };

  const exportAudit = () => {
    if (!audit) return;
    const file = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `geoaudit-${audit.coordinates.lat.toFixed(4)}-${audit.coordinates.lng.toFixed(4)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("Audit exported");
  };

  const activeSummary = audit?.aiSummary;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#e6e9f5] text-slate-900">
      <div className="satellite-map absolute inset-0" ref={mapEl} aria-label="Zoomable land intelligence map" />
      {notice && <div className="absolute right-4 top-4 z-[700] rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)]" role="status">{notice}</div>}

      <form className="absolute left-3 right-16 top-3 z-[500] flex h-11 items-center rounded-lg border border-slate-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.16)] sm:hidden" onSubmit={handleSearch}>
        <Search className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        <input className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" placeholder="Search place or coordinates" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" aria-label="Use current location" title="Use current location" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1C1C1C] text-white" onClick={useCurrentLocation}><Crosshair className="h-4 w-4" /></button>
      </form>

      <nav className="absolute bottom-5 left-5 top-5 z-[600] hidden w-12 flex-col items-center rounded-lg bg-[#1C1C1C] py-3 text-slate-400 shadow-[0_20px_60px_rgba(15,23,42,0.26)] sm:flex" aria-label="Map tools">
        <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-white" aria-label="TerraScope logo"><img src="/brand/terrascope-logo.png" alt="TerraScope" className="h-full w-full scale-[1.45] object-cover" /></div>
        <div className="mt-8 flex flex-col gap-2">
          <button title="Switch map layer" aria-label="Switch map layer" className={`grid h-8 w-8 place-items-center rounded-md transition ${layer === "satellite" ? "bg-white text-slate-950" : "hover:bg-white/10 hover:text-white"}`} onClick={() => setLayer((value) => value === "satellite" ? "map" : "satellite")}><Layers className="h-4 w-4" /></button>
          <button title="Reset map view" aria-label="Reset map view" className="grid h-8 w-8 place-items-center rounded-md transition hover:bg-white/10 hover:text-white" onClick={() => mapRef.current?.flyTo([18, 76], 5, { duration: 0.8 })}><RotateCcw className="h-4 w-4" /></button>
          <button title={`Map appearance: ${appearance}`} aria-label={`Map appearance: ${appearance}`} className={`grid h-8 w-8 place-items-center rounded-md transition ${appearance === "night" ? "bg-white text-[#1C1C1C]" : "hover:bg-white/10 hover:text-white"}`} onClick={() => setAppearance((value) => value === "auto" ? "night" : value === "night" ? "day" : "auto")}><SunMoon className="h-4 w-4" /></button>
        </div>
        <div className="mt-auto h-1 w-1 rounded-full bg-blue-400" />
      </nav>

      <aside className="absolute inset-x-3 bottom-3 top-auto z-[500] flex max-h-[60svh] w-auto flex-col overflow-hidden rounded-lg border border-white/70 bg-white/82 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:left-20 sm:top-5 sm:max-h-[calc(100svh-2.5rem)] sm:w-[380px]">
        <div className="hidden border-b border-slate-200 p-3 sm:block sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                <img src="/brand/terrascope-logo.png" alt="TerraScope logo" className="h-full w-full scale-[1.45] object-cover" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-normal text-slate-950">TerraScope</h1>
                <p className="text-xs font-medium text-[#1C1C1C]">location intelligence</p>
              </div>
            </div>
            <button
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
              aria-label="Switch map layer"
              onClick={() => setLayer((value) => value === "satellite" ? "map" : "satellite")}
            >
              <Layers className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 hidden text-xs leading-5 text-slate-500 sm:block">Inspect parcels, soil, air quality, risk, and carbon potential.</p>
        </div>

        <div className="hidden space-y-2 border-b border-slate-200 p-3 sm:block sm:space-y-3 sm:p-4">
          <form className="relative" onSubmit={handleSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              placeholder="Search a place or coordinates"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>

          <div className="grid grid-cols-3 gap-2">
            {QUICK_TARGETS.map((target) => (
              <button
                key={target.label}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => void runAudit({ lat: target.lat, lng: target.lng }, target.zoom)}
              >
                {target.label}
              </button>
            ))}
          </div>

          {recentLocations.length > 0 && <div className="hidden flex-wrap gap-1.5 sm:flex">{recentLocations.map((location) => <button key={`${location.lat}-${location.lng}`} className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700" title={location.label} onClick={() => void runAudit(location, 14)}>{location.label}</button>)}</div>}

          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1C1C1C] px-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#303030]"
            onClick={useCurrentLocation}
          >
            <Crosshair className="h-4 w-4" />
            Use Current Location
          </button>
        </div>

        <div className={`hidden grid-cols-3 gap-2 border-b border-slate-200 bg-white/35 p-3 sm:grid ${audit ? "sm:hidden" : ""}`}>
          <Metric icon={<ZoomIn className="h-4 w-4" />} label="Zoom" value={String(zoom)} />
          <Metric icon={<Wind className="h-4 w-4" />} label="Air" value="Live" />
          <Metric icon={<Gauge className="h-4 w-4" />} label="Risk" value={audit ? String(audit.aiSummary.residential_view.risk_score) : "-"} />
        </div>

        <div className="border-b border-slate-200 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="hidden text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:block">Selected point</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selected ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}` : "No coordinate selected"}</p>
              {selected && <p className="hidden text-[11px] font-semibold text-blue-600 sm:block">10 km analysis radius</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40" title="Copy coordinates" aria-label="Copy coordinates" disabled={!selected} onClick={() => void copyCoordinates()}><Copy className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40" title="Share location" aria-label="Share location" disabled={!selected} onClick={() => void shareLocation()}><Share2 className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40" title="Export audit" aria-label="Export audit" disabled={!audit} onClick={exportAudit}><Download className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600" title="Reset map view" aria-label="Reset map view" onClick={() => mapRef.current?.flyTo([18, 76], 5, { duration: 0.8 })}><RotateCcw className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="min-h-[250px] flex-1 overflow-y-auto overscroll-contain p-3 sm:min-h-[340px] sm:p-4">
          {!selected && !error && <EmptyPanel />}
          {error && !isLoading && <ErrorPanel message={error} />}
          {isLoading && <LoadingPanel />}
          {activeSummary && !isLoading && (
            <AuditPanel activeTab={activeTab} audit={audit} onTabChange={setActiveTab} />
          )}
        </div>

        <div className="hidden border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] font-semibold text-slate-500 sm:block">10 km location intelligence</div>
      </aside>

    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-md border border-white/70 bg-white/55 px-2 py-2 text-center backdrop-blur"><div className="mx-auto mb-1 grid h-6 w-6 place-items-center rounded-md bg-white/70 text-[#1C1C1C]">{icon}</div><div className="text-sm font-bold text-slate-900">{value}</div><div className="text-[10px] font-medium text-slate-500">{label}</div></div>;
}

function EmptyPanel() {
  return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm leading-6 text-slate-500"><MapPin className="mx-auto mb-2 h-5 w-5 text-blue-500" />Tap the map or choose a saved region to begin.</div>;
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />Audit issue</div>{message}</div>;
}

function LoadingPanel() {
  return <div className="grid min-h-[220px] place-items-center rounded-lg border border-slate-200 bg-slate-50 text-center"><div><Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" /><p className="mt-3 text-sm font-bold text-slate-800">Checking location</p><p className="mt-1 text-xs text-slate-500">Live data stays in this response.</p></div></div>;
}

function AuditPanel({ activeTab, audit, onTabChange }: { activeTab: TabKey; audit: LocationAudit | null; onTabChange: (tab: TabKey) => void }) {
  const summary = audit?.aiSummary;
  if (!summary) return null;
  const hasResidentialRiskEvidence = [
    summary.residential_view.air_quality_summary,
    summary.residential_view.disaster_history.floods,
    summary.residential_view.disaster_history.fires,
    summary.residential_view.disaster_history.earthquakes,
    summary.residential_view.disaster_history.landslides
  ].some(isUsefulInsight);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">{audit?.cacheMode === "nearby-lightweight-hit" ? "Nearby check found" : "Fresh audit"}</p>
        <h2 className="mt-1 text-base font-bold leading-6 text-slate-950">{audit?.placeName}</h2>
      </div>

      <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1">
        <TabButton active={activeTab === "residential"} icon={<Building2 className="h-4 w-4" />} onClick={() => onTabChange("residential")}>Residential</TabButton>
        <TabButton active={activeTab === "industrial"} icon={<Factory className="h-4 w-4" />} onClick={() => onTabChange("industrial")}>Industrial</TabButton>
        <TabButton active={activeTab === "agriculture"} icon={<Sprout className="h-4 w-4" />} onClick={() => onTabChange("agriculture")}>Agriculture</TabButton>
      </div>

      {activeTab === "residential" ? (
        <div className="space-y-3">
          <DecisionPanel decision={summary.residential_view.decision} summary={summary.residential_view.summary} />
          <DetailsLink audit={audit} view="residential" />
          {hasResidentialRiskEvidence && <ScorePanel score={summary.residential_view.risk_score} />}
          <InsightStack insights={[
            { label: "Air quality", value: summary.residential_view.air_quality_summary, accent: "blue" },
            { label: "Climate", value: summary.residential_view.climate_summary, accent: "blue" },
            { label: "Flood history", value: summary.residential_view.disaster_history.floods, accent: "danger" },
            { label: "Fire history", value: summary.residential_view.disaster_history.fires, accent: "danger" },
            { label: "Earthquake history", value: summary.residential_view.disaster_history.earthquakes, accent: "danger" },
            { label: "Landslide exposure", value: summary.residential_view.disaster_history.landslides, accent: "danger" },
            { label: "Land availability", value: summary.residential_view.local_land_availability, accent: "amber" },
            { label: "Hospitals & facilities", value: summary.residential_view.nearby_facilities, accent: "blue" }
          ]} />
        </div>
      ) : activeTab === "industrial" ? (
        <div className="space-y-3">
          <DecisionPanel decision={summary.industrial_ag_view.decision} summary={summary.industrial_ag_view.summary} />
          <DetailsLink audit={audit} view="industrial" />
          <InsightStack insights={[
            { label: "Soil pH", value: summary.industrial_ag_view.soil_ph, accent: "emerald" },
            { label: "Nitrogen", value: summary.industrial_ag_view.nitrogen, accent: "emerald" },
            { label: "Organic carbon", value: summary.industrial_ag_view.organic_carbon, accent: "emerald" },
            { label: "Construction suitability", value: summary.industrial_ag_view.construction_suitability, accent: "blue" },
            { label: "Industry & utilities", value: summary.industrial_ag_view.industrial_access_and_utility_context, accent: "blue" }
          ]} />
        </div>
      ) : (
        <div className="space-y-3">
          <DecisionPanel decision={summary.agriculture_view.decision} summary={summary.agriculture_view.summary} />
          <DetailsLink audit={audit} view="agriculture" />
          <InsightStack insights={[
            { label: "Soil health", value: summary.agriculture_view.soil_health_summary, accent: "emerald" },
            { label: "Climate outlook", value: summary.agriculture_view.climate_outlook, accent: "blue" },
            { label: "Water management", value: summary.agriculture_view.water_management, accent: "blue" },
            { label: "Nutrient management", value: summary.agriculture_view.nutrient_management, accent: "amber" },
            { label: "Crop suitability", value: summary.agriculture_view.crop_suitability, accent: "emerald" }
          ]} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, children, icon, onClick }: { active: boolean; children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return <button className={`flex min-h-9 items-center justify-center gap-2 rounded-md px-2 text-xs font-bold transition ${active ? "bg-[#1C1C1C] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"}`} onClick={onClick}>{icon}{children}</button>;
}

function ScorePanel({ score }: { score: number }) {
  const width = `${Math.min(Math.max(score, 1), 10) * 10}%`;
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">Residential risk</p><p className="text-lg font-bold text-slate-950">{score}/10</p></div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-red-500" style={{ width }} /></div></div>;
}

function DecisionPanel({ decision, summary }: { decision: string; summary: string }) {
  const normalized = decision.toLowerCase();
  const tone = normalized.includes("caution") ? "border-amber-200 bg-amber-50 text-amber-800" : normalized.includes("favorable") || normalized.includes("workable") || normalized.includes("suitable") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800";
  return <div className={`rounded-lg border p-3 ${tone}`}><p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70">Decision</p><p className="mt-1 text-sm font-bold">{decision}</p><p className="mt-2 text-xs leading-5">{summary}</p></div>;
}

function InfoRow({ accent, label, value }: { accent: "amber" | "blue" | "danger" | "emerald"; label: string; value: string }) {
  const accentClass = { amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", danger: "bg-red-50 text-red-700", emerald: "bg-emerald-50 text-emerald-700" }[accent];
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className={`mb-2 inline-flex rounded-md px-2 py-1 text-[11px] font-bold ${accentClass}`}>{label}</p><p className="text-xs leading-5 text-slate-600">{value}</p></div>;
}

function InsightStack({ insights }: { insights: Array<{ accent: "amber" | "blue" | "danger" | "emerald"; label: string; value: string }> }) {
  const usefulInsights = insights.filter((insight) => isUsefulInsight(insight.value)).slice(0, 3);
  if (usefulInsights.length === 0) return null;
  return <div className="grid gap-2">{usefulInsights.map((insight) => <InfoRow key={insight.label} {...insight} />)}</div>;
}

function isUsefulInsight(value: string) {
  const omittedPhrases = ["n/a", "unavailable", "no mapped", "no verified", "could not be checked", "needs local hazard", "needs local wildfire", "needs site-specific", "no magnitude", "preliminary only", "pending verified", "kaegro texture data was not available"];
  const normalized = value.toLowerCase();
  return Boolean(value.trim()) && !omittedPhrases.some((phrase) => normalized.includes(phrase));
}

function DetailsLink({ audit, view }: { audit: LocationAudit | null; view: TabKey }) {
  if (!audit) return null;
  const { lat, lng } = audit.coordinates;
  return <a className="flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-bold text-[#1C1C1C] transition hover:bg-slate-100" href={`/details?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&view=${view}`}>See full report</a>;
}
