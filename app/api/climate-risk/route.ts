import { NextResponse } from "next/server";

export const runtime = "nodejs";

function valid(value: string | null, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = valid(params.get("lat"), -90, 90);
  const lng = valid(params.get("lng"), -180, 180);
  if (lat === null || lng === null) return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });

  const serviceUrl = process.env.CLIMATE_PREDICTOR_URL ?? (process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:8001");
  if (!serviceUrl) return NextResponse.json({ error: "Climate prediction service is not configured." }, { status: 503 });

  try {
    const url = new URL("/predict", serviceUrl);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
    url.searchParams.set("years", "20");
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json(payload, { status: response.status });
    return NextResponse.json({
      historical_yearly_climate: [],
      climate_trigger_likelihoods: [],
      ...payload
    });
  } catch {
    return NextResponse.json({ error: "Climate prediction service is unavailable." }, { status: 503 });
  }
}
