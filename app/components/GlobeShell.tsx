"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";

const SpatialGlobeApp = dynamic(() => import("@/app/components/SpatialGlobeApp"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-[#e6e9f5] text-slate-900">
      <div className="text-center" role="status" aria-live="polite">
        <div className="terrascope-loader" aria-hidden="true">
          <span className="terrascope-loader__ring terrascope-loader__ring--one" />
          <span className="terrascope-loader__ring terrascope-loader__ring--two" />
          <span className="terrascope-loader__node terrascope-loader__node--one" />
          <span className="terrascope-loader__node terrascope-loader__node--two" />
          <span className="terrascope-loader__pin"><MapPin className="h-7 w-7" fill="currentColor" /></span>
        </div>
        <p className="mt-6 text-sm font-bold">Locating your workspace</p>
        <p className="mt-1 text-xs text-slate-500">Loading terrain and map context</p>
      </div>
    </main>
  )
});

export default function GlobeShell() {
  return <SpatialGlobeApp />;
}
