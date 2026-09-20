import { NextResponse } from "next/server";
import { fetchAirQuality, fetchKaegroSoil, fetchSoilGrids, fetchWeather } from "@/lib/environment";
import { fetchEarthquakeHistory, fetchNearbyPlaces, fetchReverseGeocode } from "@/lib/place";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Coordinates, IntelligenceSummary, LocationAudit } from "@/lib/types";

export const runtime = "nodejs";

const AUDIT_SOURCE_VERSION = "openai-audit-10km-climate-v7";

type CachedAuditRow = {
  id: string;
  lat: number;
  lng: number;
  distance_meters: number;
  place_name: string | null;
  soil_nutrients: Record<string, unknown> | null;
  disaster_history: Record<string, unknown> | null;
  carbon_credit_data: Record<string, unknown> | null;
  real_estate_data: Record<string, unknown> | null;
  air_quality_data: Record<string, unknown> | null;
  weather_data: Record<string, unknown> | null;
  raw_environmental_data: Record<string, unknown> | null;
  ai_summary: IntelligenceSummary | null;
  source: string;
  cache_hits: number;
  created_at: string;
  last_checked_at: string;
};

function isValidCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function extractOutputText(response: unknown) {
  const record = response as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (record.output_text) return record.output_text;

  return record.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n");
}

type SoilMetric = {
  label: string;
  value: number | null;
  unit: string;
  interpretation: string;
};

type SoilMetrics = {
  phh2o: SoilMetric;
  nitrogen: SoilMetric;
  soc: SoilMetric;
};

function findSoilValue(soilData: Record<string, unknown>, property: string) {
  const layers = ((soilData.properties as Record<string, unknown> | undefined)?.layers ?? []) as Array<Record<string, unknown>>;
  const layer = layers.find((item) => item.name === property);
  const depths = (layer?.depths ?? []) as Array<Record<string, unknown>>;
  let weightedSum = 0;
  let totalDepth = 0;

  for (const depth of depths) {
    const values = (depth.values ?? {}) as Record<string, unknown>;
    const mean = values.mean;
    const range = (depth.range ?? {}) as Record<string, unknown>;
    const top = typeof range.top_depth === "number" ? range.top_depth : null;
    const bottom = typeof range.bottom_depth === "number" ? range.bottom_depth : null;

    if (typeof mean !== "number") continue;

    const thickness = top !== null && bottom !== null && bottom > top ? bottom - top : 1;
    weightedSum += mean * thickness;
    totalDepth += thickness;
  }

  return totalDepth > 0 ? weightedSum / totalDepth : null;
}

function summarizeSoilGrids(soilData: Record<string, unknown>): SoilMetrics {
  const phRaw = findSoilValue(soilData, "phh2o");
  const nitrogenRaw = findSoilValue(soilData, "nitrogen");
  const socRaw = findSoilValue(soilData, "soc");
  const ph = phRaw === null ? null : phRaw / 10;
  const nitrogen = nitrogenRaw === null ? null : nitrogenRaw / 100;
  const soc = socRaw === null ? null : socRaw / 10;

  return {
    phh2o: {
      label: "Soil pH",
      value: ph,
      unit: "pH",
      interpretation: ph === null ? "No pH value returned by SoilGrids." : ph < 5.5 ? "Acidic; liming may be needed for many crops." : ph <= 7.5 ? "Near neutral range for many crops." : "Alkaline; nutrient availability may be constrained."
    },
    nitrogen: {
      label: "Nitrogen",
      value: nitrogen,
      unit: "g/kg",
      interpretation: nitrogen === null ? "No nitrogen value returned by SoilGrids." : nitrogen < 1 ? "Low nitrogen; fertility inputs may be needed." : nitrogen <= 2 ? "Moderate nitrogen availability." : "Relatively strong nitrogen signal for topsoil."
    },
    soc: {
      label: "Soil organic carbon",
      value: soc,
      unit: "g/kg",
      interpretation: soc === null ? "No SOC value returned by SoilGrids." : soc < 10 ? "Low organic carbon; weaker structure and water retention likely." : soc <= 30 ? "Moderate organic carbon; fair soil structure potential." : "High organic carbon; better water retention and carbon potential."
    }
  };
}

function formatMetric(metric: SoilMetric) {
  const value = metric.value === null ? "n/a" : metric.value.toFixed(metric.unit === "pH" ? 1 : 2);
  return `${metric.label}: ${value} ${metric.unit}. ${metric.interpretation}`;
}

async function safeExternalData(label: string, loader: () => Promise<Record<string, unknown>>) {
  try {
    return await loader();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    console.error(`${label} request failed`, error);
    return { unavailable: true, source: label, error: message };
  }
}

function buildCachedAudit(row: CachedAuditRow): LocationAudit | null {
  if (!row.ai_summary) return null;

  return {
    id: row.id,
    coordinates: { lat: row.lat, lng: row.lng },
    distanceMeters: row.distance_meters,
    placeName: row.place_name ?? [row.ai_summary.location.city, row.ai_summary.location.region, row.ai_summary.location.country].filter(Boolean).join(", "),
    soilNutrients: row.soil_nutrients ?? row.ai_summary.industrial_ag_view,
    disasterHistory: row.disaster_history ?? row.ai_summary.residential_view.disaster_history,
    carbonCreditData: row.carbon_credit_data ?? row.ai_summary.carbon_credits,
    realEstateData: row.real_estate_data ?? {
      risk_score: row.ai_summary.residential_view.risk_score,
      local_land_availability: row.ai_summary.residential_view.local_land_availability,
      estimated_market_price_range_per_sqm: row.ai_summary.residential_view.estimated_market_price_range_per_sqm
    },
    airQualityData: row.air_quality_data ?? {},
    weatherData: row.weather_data ?? {},
    rawEnvironmentalData: row.raw_environmental_data ?? {},
    aiSummary: row.ai_summary,
    cached: true,
    cacheMode: "nearby-json-hit",
    createdAt: row.created_at,
    updatedAt: row.last_checked_at
  };
}

function listNearby(nearbyPlaces: Record<string, unknown>, category: string, label: string) {
  if (nearbyPlaces.unavailable) return `Mapping provider unavailable, so ${label.toLowerCase()} could not be checked within 10 km.`;
  const categories = (nearbyPlaces.categories ?? {}) as Record<string, unknown>;
  const places = Array.isArray(categories[category]) ? categories[category] as Array<Record<string, unknown>> : [];
  if (!places.length) return `No mapped ${label.toLowerCase()} found within the checked 10 km radius.`;
  return places.slice(0, 3).map((place) => `${String(place.name ?? "Mapped place")} (${String(place.distance_km ?? "?")} km)`).join(", ");
}

function earthquakeSummary(earthquakeData: Record<string, unknown>) {
  const features = Array.isArray(earthquakeData.features) ? earthquakeData.features as Array<Record<string, unknown>> : [];
  if (!features.length) return "USGS recorded no magnitude 3+ earthquakes within 10 km during the last 10 years; local seismic codes still apply.";
  const largest = Math.max(...features.map((feature) => Number((feature.properties as Record<string, unknown> | undefined)?.mag) || 0));
  return `USGS recorded ${features.length} magnitude 3+ earthquakes within 10 km during the last 10 years; largest recorded magnitude was ${largest.toFixed(1)}. Local seismic codes still apply.`;
}

function weatherCondition(code: unknown) {
  const numeric = typeof code === "number" ? code : null;
  if (numeric === null) return "conditions unavailable";
  if (numeric === 0) return "clear";
  if ([1, 2, 3].includes(numeric)) return "partly to mostly cloudy";
  if ([45, 48].includes(numeric)) return "foggy";
  if ([51, 53, 55, 56, 57].includes(numeric)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numeric)) return "rainy";
  if ([71, 73, 75, 77, 85, 86].includes(numeric)) return "snowy";
  if ([95, 96, 99].includes(numeric)) return "thunderstorm risk";
  return "mixed conditions";
}

function climateSummary(weatherData: Record<string, unknown>) {
  const current = (weatherData.current ?? {}) as Record<string, unknown>;
  const daily = (weatherData.daily ?? {}) as Record<string, unknown>;
  const todayHigh = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
  const todayLow = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
  const precipitation = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum[0] : null;
  const chance = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] : null;
  const currentTemperature = typeof current.temperature_2m === "number" ? `${current.temperature_2m} C` : "temperature unavailable";
  const apparentTemperature = typeof current.apparent_temperature === "number" ? `${current.apparent_temperature} C feels-like` : null;
  const dailyRange = typeof todayLow === "number" && typeof todayHigh === "number" ? `${todayLow}-${todayHigh} C today` : null;
  const rainfall = typeof precipitation === "number" ? `${precipitation} mm forecast rain${typeof chance === "number" ? ` (${chance}% chance)` : ""}` : null;
  return [`Now ${currentTemperature}, ${weatherCondition(current.weather_code)}`, apparentTemperature, dailyRange, rainfall].filter(Boolean).join(". ");
}

function calculateResidentialScreeningRisk(
  airQualityData: Record<string, unknown>,
  weatherData: Record<string, unknown>,
  earthquakeData: Record<string, unknown>
) {
  const air = (airQualityData.current ?? {}) as Record<string, unknown>;
  const weather = (weatherData.daily ?? {}) as Record<string, unknown>;
  const pm25 = typeof air.pm2_5 === "number" ? air.pm2_5 : null;
  const rain = Array.isArray(weather.precipitation_sum) && typeof weather.precipitation_sum[0] === "number" ? weather.precipitation_sum[0] : null;
  const rainChance = Array.isArray(weather.precipitation_probability_max) && typeof weather.precipitation_probability_max[0] === "number" ? weather.precipitation_probability_max[0] : null;
  const wind = Array.isArray(weather.wind_speed_10m_max) && typeof weather.wind_speed_10m_max[0] === "number" ? weather.wind_speed_10m_max[0] : null;
  const earthquakes = Array.isArray(earthquakeData.features) ? earthquakeData.features as Array<Record<string, unknown>> : [];
  const strongestEarthquake = Math.max(0, ...earthquakes.map((item) => Number((item.properties as Record<string, unknown> | undefined)?.mag) || 0));

  let score = 1;
  if (pm25 === null) score += 1;
  else if (pm25 > 35) score += 3;
  else if (pm25 > 15) score += 2;
  else if (pm25 > 5) score += 1;

  if (rain !== null && rain >= 50) score += 3;
  else if (rain !== null && rain >= 20) score += 2;
  else if (rain !== null && rain >= 5) score += 1;
  else if (rainChance !== null && rainChance >= 80) score += 1;

  if (wind !== null && wind >= 60) score += 2;
  else if (wind !== null && wind >= 40) score += 1;

  if (earthquakes.length > 0) score += 2;
  if (strongestEarthquake >= 5) score += 1;
  return Math.min(10, Math.max(1, score));
}

function getFallbackSummary(
  coordinates: Coordinates,
  airQualityData: Record<string, unknown>,
  soilMetrics: SoilMetrics,
  weatherData: Record<string, unknown> = {},
  reverseGeocodeData: Record<string, unknown> = {},
  nearbyPlaces: Record<string, unknown> = {},
  earthquakeData: Record<string, unknown> = {}
): IntelligenceSummary {
  const current = (airQualityData.current ?? {}) as Record<string, unknown>;
  const weather = (weatherData.current ?? {}) as Record<string, unknown>;
  const climate = climateSummary(weatherData);
  const address = (reverseGeocodeData.address ?? {}) as Record<string, unknown>;
  const pm25 = typeof current.pm2_5 === "number" ? current.pm2_5 : null;
  const no2 = typeof current.nitrogen_dioxide === "number" ? current.nitrogen_dioxide : null;
  const riskScore = calculateResidentialScreeningRisk(airQualityData, weatherData, earthquakeData);

  return {
    location: {
      city: String(address.city ?? address.town ?? address.village ?? address.county ?? "Nearest mapped settlement"),
      region: String(address.state ?? address.region ?? `${coordinates.lat.toFixed(3)}, ${coordinates.lng.toFixed(3)}`),
      country: String(address.country ?? "Country not returned by geocoder")
    },
    residential_view: {
      summary: pm25 === null
        ? "No verified residential suitability conclusion is available yet because live air-quality data was not returned."
        : `This is an initial 10 km residential screen based on current environmental data and mapped context. It is not a substitute for title, zoning, flood, or structural due diligence.`,
      decision: pm25 === null ? "Needs verification" : riskScore >= 7 ? "Caution before buying" : "Potentially favorable, verify first",
      disaster_history: {
        floods: "Needs local hazard validation from municipal or national datasets.",
        fires: "Needs local wildfire and fire service validation.",
        earthquakes: earthquakeSummary(earthquakeData),
        landslides: "Needs site-specific terrain, slope, drainage, and local landslide-inventory validation."
      },
      risk_score: riskScore,
      air_quality_summary: `PM2.5 ${pm25 ?? "n/a"} ug/m3, NO2 ${no2 ?? "n/a"} ug/m3 from Open-Meteo.`,
      climate_summary: climate,
      local_land_availability: "Use zoning, cadastral, and satellite inspection before purchase decisions.",
      estimated_market_price_range_per_sqm: "No verified public listing price was returned. Check local registered listings and transaction records before pricing.",
      nearby_facilities: `Hospitals: ${listNearby(nearbyPlaces, "hospitals", "hospitals")}. Clinics: ${listNearby(nearbyPlaces, "clinics", "clinics")}. Pharmacies: ${listNearby(nearbyPlaces, "pharmacies", "pharmacies")}.`,
      nearby_towns_and_services: `Settlements: ${listNearby(nearbyPlaces, "towns", "settlements")}. Markets: ${listNearby(nearbyPlaces, "markets", "markets")}. Transport/fuel: ${listNearby(nearbyPlaces, "transport", "transport services")}.`,
      verified_sale_signals: listNearby(nearbyPlaces, "listings", "properties marked for sale")
    },
    industrial_ag_view: {
      summary: soilMetrics.phh2o.value === null
        ? "No reliable soil profile was returned for this pin, so industrial suitability cannot be concluded from remote data alone."
        : `The remote soil profile is a starting point only. Construction approval still requires a geotechnical survey, zoning confirmation, utility capacity, and access review.`,
      decision: soilMetrics.phh2o.value === null ? "Needs site survey" : "Potentially workable, verify first",
      soil_ph: formatMetric(soilMetrics.phh2o),
      nitrogen: formatMetric(soilMetrics.nitrogen),
      organic_carbon: formatMetric(soilMetrics.soc),
      water_retention: "Estimate requires field texture, slope, drainage, and rainfall validation.",
      construction_suitability: "Preliminary only; geotechnical survey required.",
      agriculture_suitability: "Preliminary only; validate with field samples.",
      industrial_access_and_utility_context: `Mapped industrial/work sites: ${listNearby(nearbyPlaces, "industrial", "industrial sites")}. Confirm road capacity, three-phase power, water, wastewater, zoning, and permits with local authorities.`
    },
    agriculture_view: {
      summary: soilMetrics.phh2o.value === null
        ? "No usable remote soil-health values were returned for this pin. Do not make a crop or fertilizer decision until a local lab sample is available."
        : "Remote soil indicators are available for an early crop-planning screen. Confirm them with a local soil sample before buying inputs or selecting a crop.",
      decision: soilMetrics.phh2o.value === null ? "Soil test required" : "Potentially suitable, validate locally",
      soil_health_summary: `${formatMetric(soilMetrics.phh2o)} ${formatMetric(soilMetrics.nitrogen)} ${formatMetric(soilMetrics.soc)}`,
      climate_outlook: climate,
      texture_and_structure: "Kaegro texture data was not available. Confirm sand, silt, clay, bulk density, and compaction with a field sample before selecting machinery or crops.",
      water_management: "Use field drainage and irrigation observations before setting a watering schedule. Soil organic carbon is a useful first signal for water-holding potential.",
      nutrient_management: "Apply fertilizer only after a local laboratory test confirms N, P, K, micronutrients, salinity, and crop-specific needs.",
      crop_suitability: "Preliminary only. Match crop choice to local season, irrigation, drainage, market access, and a field soil test.",
      latest_conditions: `Current weather: ${typeof weather.temperature_2m === "number" ? `${weather.temperature_2m} C` : "temperature unavailable"}, ${typeof weather.relative_humidity_2m === "number" ? `${weather.relative_humidity_2m}% humidity` : "humidity unavailable"}, ${typeof weather.precipitation === "number" ? `${weather.precipitation} mm precipitation` : "precipitation unavailable"}.`,
      recommended_next_step: "Collect a geo-tagged soil sample and validate pH, NPK, EC, texture, and organic matter before committing to crop inputs."
    },
    carbon_credits: {
      vegetation_biomass_density: "Satellite inspection visible in the map; quantitative biomass layer not connected.",
      estimated_carbon_sequestration_potential_tco2e_per_hectare_year: 0,
      estimated_offset_market_valuation_usd_per_hectare_year: "$0-$0 pending verified biomass and project methodology."
    }
  };
}

function completeSummary(candidate: IntelligenceSummary, fallback: IntelligenceSummary): IntelligenceSummary {
  const text = (value: unknown, defaultValue: string) => typeof value === "string" && value.trim() ? value : defaultValue;
  const number = (value: unknown, defaultValue: number) => typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
  return {
    location: {
      city: text(candidate?.location?.city, fallback.location.city),
      region: text(candidate?.location?.region, fallback.location.region),
      country: text(candidate?.location?.country, fallback.location.country)
    },
    residential_view: {
      summary: text(candidate?.residential_view?.summary, fallback.residential_view.summary),
      decision: text(candidate?.residential_view?.decision, fallback.residential_view.decision),
      disaster_history: {
        floods: text(candidate?.residential_view?.disaster_history?.floods, fallback.residential_view.disaster_history.floods),
        fires: text(candidate?.residential_view?.disaster_history?.fires, fallback.residential_view.disaster_history.fires),
        earthquakes: text(candidate?.residential_view?.disaster_history?.earthquakes, fallback.residential_view.disaster_history.earthquakes),
        landslides: text(candidate?.residential_view?.disaster_history?.landslides, fallback.residential_view.disaster_history.landslides)
      },
      // Keep the score reproducible from the supplied coordinate-level sources.
      // AI may interpret the evidence but must not silently invent a risk number.
      risk_score: fallback.residential_view.risk_score,
      air_quality_summary: text(candidate?.residential_view?.air_quality_summary, fallback.residential_view.air_quality_summary),
      climate_summary: text(candidate?.residential_view?.climate_summary, fallback.residential_view.climate_summary),
      local_land_availability: text(candidate?.residential_view?.local_land_availability, fallback.residential_view.local_land_availability),
      estimated_market_price_range_per_sqm: text(candidate?.residential_view?.estimated_market_price_range_per_sqm, fallback.residential_view.estimated_market_price_range_per_sqm),
      nearby_facilities: text(candidate?.residential_view?.nearby_facilities, fallback.residential_view.nearby_facilities),
      nearby_towns_and_services: text(candidate?.residential_view?.nearby_towns_and_services, fallback.residential_view.nearby_towns_and_services),
      verified_sale_signals: text(candidate?.residential_view?.verified_sale_signals, fallback.residential_view.verified_sale_signals)
    },
    industrial_ag_view: {
      summary: text(candidate?.industrial_ag_view?.summary, fallback.industrial_ag_view.summary),
      decision: text(candidate?.industrial_ag_view?.decision, fallback.industrial_ag_view.decision),
      soil_ph: text(candidate?.industrial_ag_view?.soil_ph, fallback.industrial_ag_view.soil_ph),
      nitrogen: text(candidate?.industrial_ag_view?.nitrogen, fallback.industrial_ag_view.nitrogen),
      organic_carbon: text(candidate?.industrial_ag_view?.organic_carbon, fallback.industrial_ag_view.organic_carbon),
      water_retention: text(candidate?.industrial_ag_view?.water_retention, fallback.industrial_ag_view.water_retention),
      construction_suitability: text(candidate?.industrial_ag_view?.construction_suitability, fallback.industrial_ag_view.construction_suitability),
      agriculture_suitability: text(candidate?.industrial_ag_view?.agriculture_suitability, fallback.industrial_ag_view.agriculture_suitability),
      industrial_access_and_utility_context: text(candidate?.industrial_ag_view?.industrial_access_and_utility_context, fallback.industrial_ag_view.industrial_access_and_utility_context)
    },
    agriculture_view: {
      summary: text(candidate?.agriculture_view?.summary, fallback.agriculture_view.summary),
      decision: text(candidate?.agriculture_view?.decision, fallback.agriculture_view.decision),
      soil_health_summary: text(candidate?.agriculture_view?.soil_health_summary, fallback.agriculture_view.soil_health_summary),
      climate_outlook: text(candidate?.agriculture_view?.climate_outlook, fallback.agriculture_view.climate_outlook),
      texture_and_structure: text(candidate?.agriculture_view?.texture_and_structure, fallback.agriculture_view.texture_and_structure),
      water_management: text(candidate?.agriculture_view?.water_management, fallback.agriculture_view.water_management),
      nutrient_management: text(candidate?.agriculture_view?.nutrient_management, fallback.agriculture_view.nutrient_management),
      crop_suitability: text(candidate?.agriculture_view?.crop_suitability, fallback.agriculture_view.crop_suitability),
      latest_conditions: text(candidate?.agriculture_view?.latest_conditions, fallback.agriculture_view.latest_conditions),
      recommended_next_step: text(candidate?.agriculture_view?.recommended_next_step, fallback.agriculture_view.recommended_next_step)
    },
    carbon_credits: {
      vegetation_biomass_density: text(candidate?.carbon_credits?.vegetation_biomass_density, fallback.carbon_credits.vegetation_biomass_density),
      estimated_carbon_sequestration_potential_tco2e_per_hectare_year: number(candidate?.carbon_credits?.estimated_carbon_sequestration_potential_tco2e_per_hectare_year, fallback.carbon_credits.estimated_carbon_sequestration_potential_tco2e_per_hectare_year),
      estimated_offset_market_valuation_usd_per_hectare_year: text(candidate?.carbon_credits?.estimated_offset_market_valuation_usd_per_hectare_year, fallback.carbon_credits.estimated_offset_market_valuation_usd_per_hectare_year)
    }
  };
}

async function generateOpenAISummary(args: {
  coordinates: Coordinates;
  soilData: Record<string, unknown>;
  airQualityData: Record<string, unknown>;
  weatherData: Record<string, unknown>;
  kaegroSoilData: Record<string, unknown>;
  reverseGeocodeData: Record<string, unknown>;
  nearbyPlaces: Record<string, unknown>;
  earthquakeData: Record<string, unknown>;
  cacheHit: CachedAuditRow | null;
}) {
  const soilMetrics = summarizeSoilGrids(args.soilData);
  const fallback = getFallbackSummary(args.coordinates, args.airQualityData, soilMetrics, args.weatherData, args.reverseGeocodeData, args.nearbyPlaces, args.earthquakeData);
  if (!process.env.OPENAI_API_KEY) return fallback;

  const prompt = JSON.stringify({
    user_question: `${args.coordinates.lat.toFixed(5)}, ${args.coordinates.lng.toFixed(5)}: Can you tell me whether this is a disaster-prone area, including floods, fires, earthquakes, and landslides, what disasters can happen or have happened here, the pros and cons of buying here, carbon-credit potential, and soil nutrients? Only analyze the area within 10 km of these coordinates. Also cover nearby hospitals, towns, facilities, land-for-sale signals, industrial suitability, and agricultural potential including soil health, texture, water, nutrients, crop suitability, and latest field conditions.`,
    task: "Answer the user question using web search plus the supplied environmental data. Return only valid JSON, no markdown. Never summarize soil as only good or bad; include numeric pH, nitrogen, and soil organic carbon values with units and explain the practical meaning.",
    geographic_scope: "Use a strict 10 km radius from the supplied coordinates. State when an important source is regional rather than coordinate-specific.",
    storage_policy: "The database stores successful structured audit JSON for future spatial cache hits.",
    coordinates: args.coordinates,
    nearby_prior_check: args.cacheHit
      ? {
          distance_meters: Math.round(args.cacheHit.distance_meters),
          place_name: args.cacheHit.place_name,
          last_checked_at: args.cacheHit.last_checked_at
        }
      : null,
    normalized_soil_metrics: soilMetrics,
    raw_soilgrids_data: args.soilData,
    raw_air_quality_data: args.airQualityData,
    raw_weather_data: args.weatherData,
    raw_kaegro_soil_data: args.kaegroSoilData,
    reverse_geocode: args.reverseGeocodeData,
    nearby_openstreetmap_places: args.nearbyPlaces,
    usgs_earthquake_history: args.earthquakeData,
    required_schema: {
      location: { city: "string", region: "string", country: "string" },
      residential_view: {
        summary: "string: concise evidence-based 10 km screening conclusion",
        decision: "string: Favorable, Potentially favorable, Caution before buying, or Needs verification",
        disaster_history: { floods: "string", fires: "string", earthquakes: "string", landslides: "string" },
        risk_score: "number 1-10",
        air_quality_summary: "string",
        climate_summary: "string: current weather plus short forecast, using supplied Open-Meteo data",
        local_land_availability: "string",
        estimated_market_price_range_per_sqm: "string",
        nearby_facilities: "string",
        nearby_towns_and_services: "string",
        verified_sale_signals: "string"
      },
      industrial_ag_view: {
        summary: "string: concise evidence-based industrial screening conclusion",
        decision: "string: Potentially workable, Caution, or Needs site survey",
        soil_ph: "string",
        nitrogen: "string",
        organic_carbon: "string",
        water_retention: "string",
        construction_suitability: "string",
        agriculture_suitability: "string",
        industrial_access_and_utility_context: "string"
      },
      agriculture_view: {
        summary: "string: concise evidence-based agricultural screening conclusion",
        decision: "string: Potentially suitable, Caution, or Soil test required",
        soil_health_summary: "string",
        climate_outlook: "string: current weather plus short forecast, using supplied Open-Meteo data",
        texture_and_structure: "string",
        water_management: "string",
        nutrient_management: "string",
        crop_suitability: "string",
        latest_conditions: "string",
        recommended_next_step: "string"
      },
      carbon_credits: {
        vegetation_biomass_density: "string",
        estimated_carbon_sequestration_potential_tco2e_per_hectare_year: "number",
        estimated_offset_market_valuation_usd_per_hectare_year: "string using $15-$50 per credit"
      }
    }
  });

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        tools: [{ type: "web_search", search_context_size: "medium" }],
        input: [
          {
            role: "system",
            content: "You are a cautious spatial intelligence analyst. Use current web sources where useful, but only make claims that are relevant to the supplied coordinate or its 10 km radius. Treat the supplied Kaegro Global Soil, OpenStreetMap, USGS, SoilGrids, Open-Meteo, and reverse-geocoding data as factual inputs. For Residential, Industrial, and Agriculture, write a short decision summary first: state what the evidence means, whether it looks favorable, cautionary, or needs validation, and name the exact missing due-diligence item when data is insufficient. Do not turn missing, failed, or unavailable data into a claim that the area is safe, farm-ready, or has no facilities. Do not claim a property is for sale, quote a listing price, or state local disaster history without source support; say that verified data was not found. For landslides, report only documented local events or a supported slope, drainage, or terrain exposure finding; do not infer a landslide risk just because the region is rainy. Return only valid JSON matching the requested keys. For soil, retain the supplied normalized pH, nitrogen, and organic-carbon values and avoid generic phrases like good soil unless the numbers support it."
          },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch (error) {
    console.error("OpenAI request failed", error);
    return fallback;
  }

  if (!response.ok) {
    const message = await response.text();
    console.error("OpenAI web search response failed", message);
    return fallback;
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) return fallback;

  try {
    return completeSummary(JSON.parse(text) as IntelligenceSummary, fallback);
  } catch (error) {
    console.error("OpenAI returned non-JSON text", error, text);
    return fallback;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Coordinates>;
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
      return jsonResponse({ error: "Latitude and longitude are required." }, 400);
    }

    const coordinates = { lat, lng };
    const supabase = createSupabaseAdmin();
    let cacheHit: CachedAuditRow | null = null;

    if (supabase) {
      const { data: cachedRows, error: cacheError } = await supabase.rpc("find_location_audit", {
        query_lat: lat,
        query_lng: lng,
        radius_meters: 500
      });
      if (cacheError) console.error("Supabase cache lookup failed", cacheError);
      cacheHit = (cachedRows?.[0] ?? null) as CachedAuditRow | null;

      if (cacheHit?.ai_summary && cacheHit.source === AUDIT_SOURCE_VERSION) {
        const cachedAudit = buildCachedAudit(cacheHit);
        if (cachedAudit) {
          const { error: updateError } = await supabase
            .from("location_audits")
            .update({
              cache_hits: cacheHit.cache_hits + 1,
              last_checked_at: new Date().toISOString()
            })
            .eq("id", cacheHit.id);
          if (updateError) console.error("Supabase cache hit update failed", updateError);

          return jsonResponse(cachedAudit);
        }
      }
    }

    const [soilData, airQualityData, weatherData, kaegroSoilData, reverseGeocodeData, nearbyPlaces, earthquakeData] = await Promise.all([
      safeExternalData("SoilGrids", () => fetchSoilGrids(coordinates)),
      safeExternalData("Open-Meteo air quality", () => fetchAirQuality(coordinates)),
      safeExternalData("Open-Meteo weather", () => fetchWeather(coordinates)),
      safeExternalData("Kaegro Global Soil", () => fetchKaegroSoil(coordinates)),
      safeExternalData("OpenStreetMap reverse geocoding", () => fetchReverseGeocode(coordinates)),
      safeExternalData("OpenStreetMap nearby places", () => fetchNearbyPlaces(coordinates)),
      safeExternalData("USGS earthquake history", () => fetchEarthquakeHistory(coordinates))
    ]);
    const soilMetrics = summarizeSoilGrids(soilData);
    const factualSummary = getFallbackSummary(
      coordinates,
      airQualityData,
      soilMetrics,
      weatherData,
      reverseGeocodeData,
      nearbyPlaces,
      earthquakeData
    );
    const aiSummary = await generateOpenAISummary({
      coordinates,
      soilData,
      airQualityData,
      weatherData,
      kaegroSoilData,
      reverseGeocodeData,
      nearbyPlaces,
      earthquakeData,
      cacheHit
    });
    // Keep source-derived locality facts intact; AI only interprets the broader assessment.
    aiSummary.residential_view.disaster_history.earthquakes = factualSummary.residential_view.disaster_history.earthquakes;
    aiSummary.location = factualSummary.location;
    aiSummary.residential_view.nearby_facilities = factualSummary.residential_view.nearby_facilities;
    aiSummary.residential_view.nearby_towns_and_services = factualSummary.residential_view.nearby_towns_and_services;
    aiSummary.residential_view.verified_sale_signals = factualSummary.residential_view.verified_sale_signals;
    aiSummary.industrial_ag_view.industrial_access_and_utility_context = factualSummary.industrial_ag_view.industrial_access_and_utility_context;
    aiSummary.industrial_ag_view.soil_ph = formatMetric(soilMetrics.phh2o);
    aiSummary.industrial_ag_view.nitrogen = formatMetric(soilMetrics.nitrogen);
    aiSummary.industrial_ag_view.organic_carbon = formatMetric(soilMetrics.soc);

    const placeName = [aiSummary.location.city, aiSummary.location.region, aiSummary.location.country].filter(Boolean).join(", ");
    const audit: LocationAudit = {
      id: cacheHit?.id,
      coordinates,
      distanceMeters: cacheHit?.distance_meters,
      placeName,
      soilNutrients: aiSummary.industrial_ag_view,
      disasterHistory: aiSummary.residential_view.disaster_history,
      carbonCreditData: aiSummary.carbon_credits,
      realEstateData: {
        risk_score: aiSummary.residential_view.risk_score,
        local_land_availability: aiSummary.residential_view.local_land_availability,
        estimated_market_price_range_per_sqm: aiSummary.residential_view.estimated_market_price_range_per_sqm
      },
      airQualityData,
      weatherData,
      rawEnvironmentalData: {
        soil_metrics: soilMetrics,
        soilgrids: soilData,
        open_meteo_air_quality: airQualityData,
        open_meteo_weather: weatherData,
        kaegro_global_soil: kaegroSoilData,
        openstreetmap_reverse_geocode: reverseGeocodeData,
        openstreetmap_nearby_places: nearbyPlaces,
        usgs_earthquake_history: earthquakeData
      },
      aiSummary,
      cached: Boolean(cacheHit),
      cacheMode: supabase ? (cacheHit ? "nearby-lightweight-hit" : "miss") : "disabled",
      createdAt: cacheHit?.created_at,
      updatedAt: cacheHit?.last_checked_at
    };

    if (supabase) {
      if (cacheHit) {
        const { error: updateError } = await supabase
          .from("location_audits")
          .update({
            place_name: placeName,
            soil_nutrients: audit.soilNutrients,
            disaster_history: audit.disasterHistory,
            carbon_credit_data: audit.carbonCreditData,
            real_estate_data: audit.realEstateData,
            air_quality_data: audit.airQualityData,
            weather_data: audit.weatherData,
            raw_environmental_data: audit.rawEnvironmentalData,
            ai_summary: audit.aiSummary,
            source: AUDIT_SOURCE_VERSION,
            cache_hits: cacheHit.cache_hits + 1,
            last_checked_at: new Date().toISOString()
          })
          .eq("id", cacheHit.id);
        if (updateError) console.error("Supabase cache update failed", updateError);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("location_audits")
          .insert({
            location: `SRID=4326;POINT(${lng} ${lat})`,
            place_name: placeName,
            soil_nutrients: audit.soilNutrients,
            disaster_history: audit.disasterHistory,
            carbon_credit_data: audit.carbonCreditData,
            real_estate_data: audit.realEstateData,
            air_quality_data: audit.airQualityData,
            weather_data: audit.weatherData,
            raw_environmental_data: audit.rawEnvironmentalData,
            ai_summary: audit.aiSummary,
            source: AUDIT_SOURCE_VERSION
          })
          .select("id, created_at, last_checked_at")
          .single();
        if (insertError) console.error("Supabase cache write failed", insertError);
        else if (inserted) {
          audit.id = inserted.id;
          audit.createdAt = inserted.created_at;
          audit.updatedAt = inserted.last_checked_at;
        }
      }
    }

    return jsonResponse(audit);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to analyze this location." }, 500);
  }
}
