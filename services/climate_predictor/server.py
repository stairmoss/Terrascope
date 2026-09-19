"""Coordinate-level climate-trigger likelihood service.

This service estimates the frequency of weather indicators from historical
observations. It does not predict a specific flood, landslide, or storm.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import date
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from statistics import fmean, pstdev
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CLIMATE_URL = "https://climate-api.open-meteo.com/v1/climate"
DEFAULT_YEARS = 20
MAX_YEARS = 30


def number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def annual_chance(events: list[bool]) -> tuple[int, int]:
    hits = sum(events)
    total = len(events)
    # Jeffreys smoothing avoids reporting mathematically absolute 0% or 100%
    # likelihoods from a limited historical sample.
    return hits, round(100 * (hits + 0.5) / (total + 1))


def linear_trend(values: list[float]) -> float:
    count = len(values)
    if count < 2:
        return 0.0
    x_mean = (count - 1) / 2
    y_mean = fmean(values)
    numerator = sum((index - x_mean) * (value - y_mean) for index, value in enumerate(values))
    denominator = sum((index - x_mean) ** 2 for index in range(count))
    return numerator / denominator if denominator else 0.0


def condition_summary(days: list[dict[str, float]], threshold: float, field: str) -> list[bool]:
    by_year: dict[int, list[dict[str, float]]] = defaultdict(list)
    for day in days:
        by_year[int(day["year"])].append(day)
    return [any(day[field] >= threshold for day in values) for _, values in sorted(by_year.items())]


@lru_cache(maxsize=256)
def fetch_history(lat: float, lng: float, years: int) -> dict[str, Any]:
    last_year = date.today().year - 1
    first_year = last_year - years + 1
    query = urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "start_date": f"{first_year}-01-01",
            "end_date": f"{last_year}-12-31",
            "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
            "timezone": "auto",
        }
    )
    with urlopen(f"{ARCHIVE_URL}?{query}", timeout=35) as response:
        return json.load(response)


@lru_cache(maxsize=256)
def fetch_live_context(lat: float, lng: float) -> dict[str, Any]:
    query = urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
            "forecast_days": 16,
            "timezone": "auto",
        }
    )
    with urlopen(f"{FORECAST_URL}?{query}", timeout=20) as response:
        return json.load(response)


@lru_cache(maxsize=256)
def fetch_cmip6_signal(lat: float, lng: float) -> dict[str, Any] | None:
    next_year = date.today().year + 1
    query = urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "start_date": f"{next_year}-01-01",
            "end_date": f"{next_year}-12-31",
            "models": "EC_Earth3P_HR",
            "daily": "temperature_2m_mean,temperature_2m_max,precipitation_sum",
            "timezone": "auto",
        }
    )
    try:
        with urlopen(f"{CLIMATE_URL}?{query}", timeout=30) as response:
            return json.load(response)
    except Exception:
        return None


def build_prediction(lat: float, lng: float, years: int) -> dict[str, Any]:
    payload = fetch_history(lat, lng, years)
    live_context = fetch_live_context(lat, lng)
    cmip6_context = fetch_cmip6_signal(lat, lng)
    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    temperatures = daily.get("temperature_2m_mean", [])
    max_temperatures = daily.get("temperature_2m_max", [])
    min_temperatures = daily.get("temperature_2m_min", [])
    precipitation = daily.get("precipitation_sum", [])
    winds = daily.get("wind_speed_10m_max", [])
    days: list[dict[str, float]] = []

    for item in zip(dates, temperatures, max_temperatures, min_temperatures, precipitation, winds):
        timestamp, mean_temp, max_temp, min_temp, rain, wind = item
        values = [number(value) for value in (mean_temp, max_temp, min_temp, rain, wind)]
        if any(value is None for value in values):
            continue
        days.append(
            {
                "year": float(str(timestamp)[:4]),
                "mean_temp": values[0],
                "max_temp": values[1],
                "min_temp": values[2],
                "rain": values[3],
                "wind": values[4],
            }
        )

    if not days:
        raise ValueError("Historical weather provider returned no usable daily observations.")

    by_year: dict[int, list[dict[str, float]]] = defaultdict(list)
    for day in days:
        by_year[int(day["year"])].append(day)
    ordered_years = sorted(by_year)
    annual_rain = [sum(day["rain"] for day in by_year[year]) for year in ordered_years]
    annual_mean_temp = [fmean(day["mean_temp"] for day in by_year[year]) for year in ordered_years]
    annual_history = [
        {
            "year": year,
            "mean_temperature_c": round(fmean(day["mean_temp"] for day in by_year[year]), 1),
            "total_precipitation_mm": round(sum(day["rain"] for day in by_year[year]), 1),
            "maximum_daily_temperature_c": round(max(day["max_temp"] for day in by_year[year]), 1),
            "maximum_daily_wind_kmh": round(max(day["wind"] for day in by_year[year]), 1),
        }
        for year in ordered_years
    ]
    rain_episode = []
    for year in ordered_years:
        values = by_year[year]
        rolling_peak = max((sum(day["rain"] for day in values[index:index + 3]) for index in range(len(values) - 2)), default=0)
        rain_episode.append(rolling_peak >= 75)

    likelihoods = []
    for label, events, caution in [
        ("Heavy rainfall day", condition_summary(days, 50, "rain"), "Can increase local flood and drainage pressure; it is not a flood forecast."),
        ("Three-day intense rainfall episode", rain_episode, "Can increase drainage, flood, and slope-trigger exposure where local terrain is susceptible."),
        ("Heat stress day", condition_summary(days, 35, "max_temp"), "Can affect comfort, water demand, crops, and outdoor operations."),
        ("High-wind day", condition_summary(days, 60, "wind"), "Can affect construction, crops, and exposed infrastructure."),
        ("Frost day", [any(day["min_temp"] <= 0 for day in by_year[year]) for year in ordered_years], "Can affect frost-sensitive crops and water systems."),
    ]:
        hits, chance = annual_chance(events)
        likelihoods.append(
            {
                "indicator": label,
                "next_year_historical_likelihood_pct": chance,
                "historical_years_with_indicator": hits,
                "sample_years": len(ordered_years),
                "interpretation": caution,
            }
        )

    def rounded(value: float) -> float:
        return round(value, 1)

    current = live_context.get("current", {})
    forecast_daily = live_context.get("daily", {})
    forecast_rain = [number(value) or 0 for value in forecast_daily.get("precipitation_sum", [])]
    forecast_temperature = [number(value) for value in forecast_daily.get("temperature_2m_max", [])]
    forecast_wind = [number(value) for value in forecast_daily.get("wind_speed_10m_max", [])]
    cmip6_daily = cmip6_context.get("daily", {}) if cmip6_context else {}
    cmip6_temperatures = [number(value) for value in cmip6_daily.get("temperature_2m_mean", []) if number(value) is not None]
    cmip6_precipitation = [number(value) for value in cmip6_daily.get("precipitation_sum", []) if number(value) is not None]

    return {
        "coordinates": {"lat": lat, "lng": lng},
        "historical_period": {"start_year": ordered_years[0], "end_year": ordered_years[-1], "sample_years": len(ordered_years)},
        "confidence": "moderate" if len(ordered_years) >= 15 else "limited",
        "methodology": "Historical annual empirical frequency from daily weather observations. Percentages describe how often a weather indicator occurred in a sample year, not the probability of a specific disaster.",
        "next_year_climate_baseline": {
            "annual_mean_temperature_c": rounded(fmean(annual_mean_temp)),
            "annual_mean_temperature_trend_c_per_year": rounded(linear_trend(annual_mean_temp)),
            "annual_precipitation_mean_mm": rounded(fmean(annual_rain)),
            "annual_precipitation_standard_deviation_mm": rounded(pstdev(annual_rain)) if len(annual_rain) > 1 else 0,
            "annual_precipitation_trend_mm_per_year": rounded(linear_trend(annual_rain)),
        },
        "historical_yearly_climate": annual_history,
        "current_weather_context": {
            "observed_at": current.get("time"),
            "temperature_c": current.get("temperature_2m"),
            "relative_humidity_pct": current.get("relative_humidity_2m"),
            "precipitation_mm": current.get("precipitation"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
        },
        "next_16_days_outlook": {
            "total_precipitation_mm": rounded(sum(forecast_rain)),
            "maximum_temperature_c": rounded(max((value for value in forecast_temperature if value is not None), default=0)),
            "maximum_wind_kmh": rounded(max((value for value in forecast_wind if value is not None), default=0)),
        },
        "next_calendar_year_cmip6_signal": None if not cmip6_temperatures else {
            "model": "EC_Earth3P_HR",
            "year": date.today().year + 1,
            "annual_mean_temperature_c": rounded(fmean(cmip6_temperatures)),
            "annual_precipitation_mm": rounded(sum(cmip6_precipitation)),
            "note": "Downscaled CMIP6 climate-model signal. It describes long-term climate conditions, not a day-specific weather or disaster forecast.",
        },
        "climate_trigger_likelihoods": likelihoods,
        "important_limit": "Floods and landslides also depend on river levels, drainage, slope, soil, land cover, construction, and local warnings. This service must not be used as an evacuation, insurance, or investment decision tool.",
        "source": "Open-Meteo Historical Weather API, Forecast API, and CMIP6 Climate API",
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok", "service": "climate-predictor"})
            return
        if parsed.path != "/predict":
            self.send_json(404, {"error": "Use /predict?lat=<latitude>&lng=<longitude>&years=20"})
            return
        try:
            params = parse_qs(parsed.query)
            lat = float(params.get("lat", [""])[0])
            lng = float(params.get("lng", [""])[0])
            years = min(MAX_YEARS, max(10, int(params.get("years", [str(DEFAULT_YEARS)])[0])))
            if not -90 <= lat <= 90 or not -180 <= lng <= 180:
                raise ValueError("Coordinates are outside the valid range.")
            self.send_json(200, build_prediction(lat, lng, years))
        except Exception as error:  # The HTTP API always returns a useful client-safe message.
            self.send_json(400, {"error": str(error)})

    def log_message(self, format: str, *args: Any) -> None:
        return


if __name__ == "__main__":
    host = os.environ.get("CLIMATE_PREDICTOR_HOST", "127.0.0.1")
    port = int(os.environ.get("CLIMATE_PREDICTOR_PORT", "8001"))
    print(f"Climate predictor listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
