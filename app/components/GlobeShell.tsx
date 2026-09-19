"use client";

import dynamic from "next/dynamic";

const SpatialGlobeApp = dynamic(() => import("@/app/components/SpatialGlobeApp"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f7] text-slate-900">
      <div className="webgl-spinner" aria-label="Loading map" />
    </main>
  )
});

export default function GlobeShell() {
  return <SpatialGlobeApp />;
}
