import type { Coordinates } from "@/lib/types";

const REQUEST_TIMEOUT_MS = 9_000;
const NEARBY_PLACES_TIMEOUT_MS = 20_000;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function distanceKm(from: Coordinates, lat: number, lng: number) {
  const radians = Math.PI / 180;
  const dLat = (lat - from.lat) * radians;
  const dLng = (lng - from.lng) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, next: { revalidate: 60 * 60 * 24 } });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchReverseGeocode({ lat, lng }: Coordinates) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");
  return fetchJson(url.toString(), {
    headers: { "User-Agent": "GeoAudit/1.0 (location intelligence demo)" }
  });
}

export async function fetchNearbyPlaces(coordinates: Coordinates) {
  const { lat, lng } = coordinates;
  const query = `[out:json][timeout:20];(
    nwr(around:10000,${lat},${lng})["amenity"~"^(hospital|clinic|doctors|pharmacy|school|college|marketplace|fuel|bus_station)$"];
    nwr(around:10000,${lat},${lng})["place"~"^(city|town|village|suburb)$"];
    nwr(around:10000,${lat},${lng})["landuse"="industrial"];
    nwr(around:10000,${lat},${lng})["man_made"="works"];
    nwr(around:10000,${lat},${lng})["shop"~"^(supermarket|convenience|hardware)$"];
    nwr(around:10000,${lat},${lng})["for_sale"];
  );out center tags;`;
  const payload = await fetchJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "GeoAudit/1.0 (location intelligence demo)"
    },
    body: new URLSearchParams({ data: query }).toString()
  }, NEARBY_PLACES_TIMEOUT_MS);
  const elements = Array.isArray(payload.elements) ? payload.elements as OverpassElement[] : [];
  const categories: Record<string, Array<{ name: string; distance_km: number }>> = {
    hospitals: [], clinics: [], pharmacies: [], towns: [], industrial: [], markets: [], transport: [], listings: []
  };

  for (const element of elements) {
    const tags = element.tags ?? {};
    const point = element.center ?? (typeof element.lat === "number" && typeof element.lon === "number" ? { lat: element.lat, lon: element.lon } : null);
    if (!point) continue;
    const entry = { name: tags.name ?? tags["name:en"] ?? tags.amenity ?? tags.landuse ?? "Mapped place", distance_km: Math.round(distanceKm(coordinates, point.lat, point.lon) * 10) / 10 };
    if (tags.amenity === "hospital") categories.hospitals.push(entry);
    else if (["clinic", "doctors"].includes(tags.amenity ?? "")) categories.clinics.push(entry);
    else if (tags.amenity === "pharmacy") categories.pharmacies.push(entry);
    else if (["city", "town", "village", "suburb"].includes(tags.place ?? "")) categories.towns.push(entry);
    else if (tags.landuse === "industrial" || tags.man_made === "works") categories.industrial.push(entry);
    else if (tags.amenity === "marketplace" || ["supermarket", "convenience", "hardware"].includes(tags.shop ?? "")) categories.markets.push(entry);
    else if (tags.amenity === "bus_station" || tags.amenity === "fuel") categories.transport.push(entry);
    if (tags.for_sale) categories.listings.push(entry);
  }

  Object.values(categories).forEach((items) => items.sort((a, b) => a.distance_km - b.distance_km));
  return { radius_km: 10, categories };
}

export async function fetchEarthquakeHistory({ lat, lng }: Coordinates) {
  const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("maxradiuskm", "10");
  url.searchParams.set("minmagnitude", "3");
  url.searchParams.set("starttime", `${new Date().getUTCFullYear() - 10}-01-01`);
  url.searchParams.set("orderby", "time");
  url.searchParams.set("limit", "20");
  return fetchJson(url.toString());
}
