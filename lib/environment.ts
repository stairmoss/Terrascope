import type { Coordinates } from "@/lib/types";

const SOILGRID_PROPERTIES = ["soc", "phh2o", "nitrogen"] as const;
const SOILGRID_DEPTHS = ["0-5cm", "5-15cm", "15-30cm"] as const;

export async function fetchSoilGrids({ lat, lng }: Coordinates) {
  const url = new URL("https://rest.isric.org/soilgrids/v2.0/properties/query");
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lat", String(lat));
  SOILGRID_PROPERTIES.forEach((property) => url.searchParams.append("property", property));
  SOILGRID_DEPTHS.forEach((depth) => url.searchParams.append("depth", depth));
  url.searchParams.set("value", "mean");

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 14 } });
  if (!response.ok) throw new Error(`SoilGrids request failed with ${response.status}`);
  return response.json();
}

export async function fetchAirQuality({ lat, lng }: Coordinates) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "pm2_5,nitrogen_dioxide");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url, { next: { revalidate: 60 * 60 } });
  if (!response.ok) throw new Error(`Open-Meteo air quality request failed with ${response.status}`);
  return response.json();
}

export async function fetchWeather({ lat, lng }: Coordinates) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!response.ok) throw new Error(`Open-Meteo weather request failed with ${response.status}`);
  return response.json();
}

export async function fetchKaegroSoil({ lat, lng }: Coordinates) {
  const url = new URL("https://www.kaegro.com/farms/api/soil");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
  if (!response.ok) throw new Error(`Kaegro soil request failed with ${response.status}`);
  return response.json();
}
