import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ClimateDay = { date: string; temperature: number; maximumTemperature: number; rain: number; wind: number };

function valid(value: string | null, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function percentage(matches: number, total: number) {
  return total ? Math.round((matches / total) * 100) : 0;
}

async function buildVercelClimateFallback(lat: number, lng: number) {
  const endYear = new Date().getUTCFullYear() - 1;
  const startYear = endYear - 19;
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("start_date", `${startYear}-01-01`);
  url.searchParams.set("end_date", `${endYear}-12-31`);
  url.searchParams.set("daily", "temperature_2m_mean,temperature_2m_max,precipitation_sum,wind_speed_10m_max");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error("Historical weather provider did not return climate data.");
  const payload = await response.json() as { daily?: Record<string, unknown> };
  const daily = payload.daily ?? {};
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const means = Array.isArray(daily.temperature_2m_mean) ? daily.temperature_2m_mean : [];
  const maximums = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const rain = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : [];
  const wind = Array.isArray(daily.wind_speed_10m_max) ? daily.wind_speed_10m_max : [];
  const days: ClimateDay[] = [];

  for (let index = 0; index < dates.length; index += 1) {
    const values = [means[index], maximums[index], rain[index], wind[index]];
    if (typeof dates[index] !== "string" || values.some((value) => typeof value !== "number")) continue;
    days.push({ date: dates[index], temperature: means[index] as number, maximumTemperature: maximums[index] as number, rain: rain[index] as number, wind: wind[index] as number });
  }
  if (!days.length) throw new Error("Historical weather provider returned no usable observations.");

  const byYear = new Map<number, ClimateDay[]>();
  for (const day of days) {
    const year = Number(day.date.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), day]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const annualHistory = years.map((year) => {
    const entries = byYear.get(year) ?? [];
    return {
      year,
      mean_temperature_c: Number(average(entries.map((entry) => entry.temperature)).toFixed(1)),
      total_precipitation_mm: Number(entries.reduce((total, entry) => total + entry.rain, 0).toFixed(1)),
      maximum_daily_temperature_c: Number(Math.max(...entries.map((entry) => entry.maximumTemperature)).toFixed(1)),
      maximum_daily_wind_kmh: Number(Math.max(...entries.map((entry) => entry.wind)).toFixed(1))
    };
  });

  const monthly = new Map<string, ClimateDay[]>();
  for (const day of days.filter((entry) => Number(entry.date.slice(0, 4)) >= 2012)) {
    const key = day.date.slice(0, 7);
    monthly.set(key, [...(monthly.get(key) ?? []), day]);
  }
  const monthlyTimeline = [...monthly.entries()].map(([key, entries]) => ({
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    precipitation_mm: Number(entries.reduce((total, entry) => total + entry.rain, 0).toFixed(1)),
    flood_drainage_trigger_pct: percentage(entries.filter((entry) => entry.rain >= 25).length, entries.length),
    slope_rainfall_trigger_pct: percentage(entries.filter((entry) => entry.rain >= 50).length, entries.length),
    heat_stress_trigger_pct: percentage(entries.filter((entry) => entry.maximumTemperature >= 35).length, entries.length),
    high_wind_trigger_pct: percentage(entries.filter((entry) => entry.wind >= 60).length, entries.length)
  }));

  const likelihood = (label: string, test: (entries: ClimateDay[]) => boolean, interpretation: string) => {
    const hits = years.filter((year) => test(byYear.get(year) ?? [])).length;
    return { indicator: label, next_year_historical_likelihood_pct: Math.round(100 * (hits + 0.5) / (years.length + 1)), historical_years_with_indicator: hits, sample_years: years.length, interpretation };
  };

  return {
    coordinates: { lat, lng },
    historical_period: { start_year: years[0], end_year: years.at(-1), sample_years: years.length },
    confidence: years.length >= 15 ? "moderate" : "limited",
    next_year_climate_baseline: {
      annual_mean_temperature_c: Number(average(annualHistory.map((entry) => entry.mean_temperature_c)).toFixed(1)),
      annual_precipitation_mean_mm: Number(average(annualHistory.map((entry) => entry.total_precipitation_mm)).toFixed(1))
    },
    historical_yearly_climate: annualHistory,
    monthly_weather_trigger_timeline: monthlyTimeline,
    timeline_methodology: "Each monthly percentage is the share of observed days that crossed a weather threshold: 25 mm rain/day for flood or drainage pressure, 50 mm rain/day for slope-rainfall pressure, 35 C maximum temperature for heat stress, and 60 km/h maximum wind for high-wind exposure. These are screening indicators, not confirmed disaster counts or forecasts.",
    climate_trigger_likelihoods: [
      likelihood("Heavy rainfall day", (entries) => entries.some((entry) => entry.rain >= 50), "Can increase local flood and drainage pressure; it is not a flood forecast."),
      likelihood("Heat stress day", (entries) => entries.some((entry) => entry.maximumTemperature >= 35), "Can affect comfort, water demand, crops, and outdoor operations."),
      likelihood("High-wind day", (entries) => entries.some((entry) => entry.wind >= 60), "Can affect construction, crops, and exposed infrastructure.")
    ],
    important_limit: "Floods and landslides also depend on river levels, drainage, slope, soil, land cover, construction, and local warnings. This service must not be used as an evacuation, insurance, or investment decision tool.",
    source: "Open-Meteo Historical Weather API"
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = valid(params.get("lat"), -90, 90);
  const lng = valid(params.get("lng"), -180, 180);
  if (lat === null || lng === null) return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });

  const serviceUrl = process.env.CLIMATE_PREDICTOR_URL;
  if (serviceUrl) {
    try {
      const url = new URL("/predict", serviceUrl);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lng", String(lng));
      url.searchParams.set("years", "20");
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
      if (response.ok) return NextResponse.json(await response.json());
    } catch {
      // Fall through to the serverless Open-Meteo implementation.
    }
  }

  try {
    return NextResponse.json(await buildVercelClimateFallback(lat, lng));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Climate prediction could not be generated." }, { status: 503 });
  }
}
