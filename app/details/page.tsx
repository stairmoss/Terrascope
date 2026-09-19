import DetailsClient from "@/app/components/details/DetailsClient";

type DetailsPageProps = {
  searchParams: Promise<{ lat?: string; lng?: string; view?: string }>;
};

export default async function DetailsPage({ searchParams }: DetailsPageProps) {
  const params = await searchParams;
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const canShowMap = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const mapUrl = canShowMap
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.08}%2C${lat - 0.05}%2C${lng + 0.08}%2C${lat + 0.05}&layer=mapnik&marker=${lat}%2C${lng}`
    : undefined;

  return <div className="details-shell">
    {mapUrl && <iframe className="details-map-backdrop" title="Selected location map" src={mapUrl} />}
    <DetailsClient lat={params.lat} lng={params.lng} view={params.view} />
  </div>;
}
