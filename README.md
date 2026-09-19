# TerraScope

TerraScope is a global spatial-intelligence workspace for exploring land context at any coordinate. It brings together map interaction, environmental data, nearby-place context, soil indicators, climate outlooks, land-use screening, and carbon potential in one responsive interface.

## What It Does

- Select any point worldwide using a zoomable map, place search, or current location.
- Screen residential, industrial, and agricultural suitability independently.
- Inspect soil properties, air quality, weather, hazards, nearby services, and carbon context.
- Create a climate screen from historical observations, current conditions, a 16-day forecast, and a CMIP6 next-year climate signal.
- Export past, present, and future climate evidence as CSV.
- Cache audits by a 500 m PostGIS radius when Supabase is configured.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS, Leaflet
- Python climate service using Open-Meteo historical, forecast, and Climate APIs
- Supabase PostGIS for server-side spatial caching
- OpenAI for structured location summaries when an API key is configured

## Run Locally

Install dependencies and start the web app:

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

In a second terminal, start climate prediction:

```bash
npm run climate:predictor
```

Open `http://127.0.0.1:3000`.

## Environment

Create `.env.local` with server-side values only:

```bash
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_supabase_key
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable or client-side code.

## Supabase

Apply `supabase/location_audits.sql` to enable PostGIS, create the `location_audits` cache table, and install the `find_location_audit` 500 m radius function. The cache is intentionally server-only; browser clients do not receive direct audit-table permissions.

## Data Notes

Climate outputs are evidence-based screening indicators, not guarantees that a specific flood, fire, landslide, or other event will occur. Purchase, construction, insurance, evacuation, and agricultural decisions require local surveys, permits, and official warnings.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
python3 -m py_compile services/climate_predictor/server.py
```
