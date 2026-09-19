export type Coordinates = {
  lat: number;
  lng: number;
};

export type LocationAudit = {
  id?: string;
  coordinates: Coordinates;
  distanceMeters?: number;
  placeName: string;
  soilNutrients: Record<string, unknown>;
  disasterHistory: Record<string, unknown>;
  carbonCreditData: Record<string, unknown>;
  realEstateData: Record<string, unknown>;
  airQualityData: Record<string, unknown>;
  weatherData: Record<string, unknown>;
  rawEnvironmentalData: Record<string, unknown>;
  aiSummary: IntelligenceSummary;
  cached: boolean;
  cacheMode: "miss" | "nearby-json-hit" | "nearby-lightweight-hit" | "disabled";
  createdAt?: string;
  updatedAt?: string;
};

export type IntelligenceSummary = {
  location: { city: string; region: string; country: string };
  residential_view: {
    summary: string;
    decision: string;
    disaster_history: { floods: string; fires: string; earthquakes: string; landslides: string };
    risk_score: number;
    climate_summary: string;
      air_quality_summary: string;
      local_land_availability: string;
      estimated_market_price_range_per_sqm: string;
      nearby_facilities: string;
      nearby_towns_and_services: string;
      verified_sale_signals: string;
  };
  industrial_ag_view: {
    summary: string;
    decision: string;
    soil_ph: string;
    nitrogen: string;
    organic_carbon: string;
    water_retention: string;
      construction_suitability: string;
      agriculture_suitability: string;
    industrial_access_and_utility_context: string;
  };
  agriculture_view: {
    summary: string;
    decision: string;
    soil_health_summary: string;
    climate_outlook: string;
    texture_and_structure: string;
    water_management: string;
    nutrient_management: string;
    crop_suitability: string;
    latest_conditions: string;
    recommended_next_step: string;
  };
  carbon_credits: {
    vegetation_biomass_density: string;
    estimated_carbon_sequestration_potential_tco2e_per_hectare_year: number;
    estimated_offset_market_valuation_usd_per_hectare_year: string;
  };
};
