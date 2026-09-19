import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ error: "Enter a place or coordinates." }, { status: 400 });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "GeoAudit/1.0 (location intelligence demo)" },
      next: { revalidate: 60 * 60 * 24 }
    });
    if (!response.ok) throw new Error(`Place search failed with ${response.status}`);
    const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>;
    const result = results[0];
    if (!result) return NextResponse.json({ error: "No matching place found." }, { status: 404 });

    return NextResponse.json({ lat: Number(result.lat), lng: Number(result.lon), label: result.display_name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Place search failed." }, { status: 502 });
  }
}
