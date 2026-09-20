import Link from "next/link";
import { ArrowUpRight, Building2, ExternalLink, Factory, Github, Leaf, Linkedin, MapPin, ShieldCheck, Sprout, Waves } from "lucide-react";

const capabilities = [
  { icon: Building2, title: "Residential", text: "Screen local risk signals, nearby services, air quality, and land context before a purchase." },
  { icon: Factory, title: "Industrial", text: "Compare soil conditions, access context, construction suitability, and carbon potential." },
  { icon: Sprout, title: "Agriculture", text: "Evaluate soil health, water management, climate evidence, and crop suitability." }
];

const disasterLessons = [
  {
    place: "Wayanad, India · 2024",
    hazard: "Extreme rainfall and landslide",
    text: "The July landslide devastated communities in Wayanad. Kerala later reported 298 deaths, showing why slope, rainfall, access, and evacuation context must be assessed together.",
    source: "Government of India report",
    href: "https://www.mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/LS01042025/4962.pdf"
  },
  {
    place: "Thame, Nepal · 2024",
    hazard: "Glacial-lake outburst flood",
    text: "A glacial-lake outburst flood swept through Thame and damaged homes and infrastructure. Mountain sites need upstream glacier, lake, river-corridor, and access checks before construction decisions.",
    source: "Nepal hydrology report",
    href: "https://www.dhm.gov.np/uploads/dhm/climateService/Glacial_Lake_Outburst_Flood_in_Thame_2024.pdf"
  },
  {
    place: "Kalladi, Wayanad, India · 2026",
    hazard: "Monsoon-triggered landslide",
    text: "Heavy monsoon rain triggered a fatal landslide near Meenakshi Bridge in Kalladi, prompting rescue operations and renewed attention to slope exposure in Wayanad.",
    source: "Malayala Manorama reporting",
    href: "https://www.manoramaonline.com/news/latest-news/2026/07/07/heavy-rain-wayanad-landslide-updates.html"
  },
  {
    place: "Rasuwa corridor, Nepal · 2026",
    hazard: "Rock-ice avalanche and flash flood",
    text: "A rock-and-glacier collapse near the Nepal-China border generated a destructive flood through the Bhote Koshi and Trishuli corridors, damaging roads, bridges, homes, and hydropower infrastructure across multiple districts.",
    source: "Copernicus Emergency Management",
    href: "https://emergency.copernicus.eu/news/floods-in-nepal-and-tibet-august-2026/"
  },
  {
    place: "Chocó, Colombia · 2026",
    hazard: "Magnitude 7.4 earthquake",
    text: "A magnitude 7.4 earthquake struck western Colombia, causing damage across several departments. Seismic exposure needs regional fault, code, building, and access assessment rather than a coordinate-only score.",
    source: "PAHO situation report",
    href: "https://www.paho.org/sites/default/files/2026/08/phsa-colombiaearthquake-2026.pdf"
  },
  {
    place: "Enga, Papua New Guinea · 2024",
    hazard: "Catastrophic landslide",
    text: "A massive landslide buried a remote settlement in Enga Province. Early reports put the likely death toll above 670, underlining the stakes of terrain and route-access screening.",
    source: "Associated Press coverage",
    href: "https://apnews.com/article/642d9e8e0c913efa25ed2d67df318393"
  },
  {
    place: "Chocó, Colombia · 2024",
    hazard: "Rain-triggered mudslide",
    text: "A mudslide on a busy road killed at least 34 people after heavy rain. Risk is shaped by weather, terrain, drainage, infrastructure, and exposure at the same time.",
    source: "Associated Press coverage",
    href: "https://apnews.com/article/545edb2bd65d2f931956ea6fb0d06a4"
  }
];

export default function WelcomePage() {
  return <main className="bg-[#e6e9f5] text-slate-900">
    <section className="relative flex min-h-[86svh] overflow-hidden px-5 py-6 sm:px-10">
      <iframe title="World map" className="pointer-events-none absolute inset-0 h-full w-full opacity-60 grayscale" src="https://www.openstreetmap.org/export/embed.html?bbox=55%2C-8%2C115%2C42&layer=mapnik" />
      <div className="absolute inset-0 bg-white/30" />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-white shadow-[0_8px_24px_rgba(15,23,42,0.14)]"><img src="/brand/terrascope-logo.png" alt="TerraScope logo" className="h-full w-full scale-[1.45] object-cover" /></div><div><p className="text-lg font-bold tracking-normal">TerraScope</p><p className="text-xs font-medium text-slate-600">location intelligence</p></div></div><Link href="/workspace" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1C1C1C] px-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#303030]">Open workspace <ArrowUpRight className="h-4 w-4" /></Link></header>
        <div className="my-auto max-w-3xl py-20"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">Spatial decisions, grounded</p><h1 className="mt-5 text-5xl font-bold leading-[1.05] text-[#1C1C1C] sm:text-7xl">Know the land before you commit.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-700">TerraScope was built to make early land decisions less opaque by turning coordinates into a clear, evidence-based briefing for people comparing places, projects, and potential.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/workspace" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#1C1C1C] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#303030]">Inspect a location <MapPin className="h-4 w-4" /></Link><a href="#capabilities" className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white/75 px-4 text-sm font-bold text-slate-700 backdrop-blur transition hover:bg-white">Explore capabilities</a></div></div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-600"><Waves className="h-4 w-4" />Global coordinates. Local context.</div>
      </div>
    </section>
    <section id="capabilities" className="px-5 py-16 sm:px-10 sm:py-24"><div className="mx-auto max-w-6xl"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">One location, three views</p><h2 className="mt-3 text-3xl font-bold text-[#1C1C1C] sm:text-4xl">A clearer starting point for every land decision.</h2></div><div className="mt-10 grid gap-4 md:grid-cols-3">{capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="border border-white/90 bg-white/75 p-6 shadow-sm backdrop-blur"><div className="grid h-10 w-10 place-items-center rounded-lg bg-[#1C1C1C] text-white"><Icon className="h-5 w-5" /></div><h3 className="mt-6 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p></article>)}</div></div></section>
    <section className="border-y border-slate-200 bg-white/65 px-5 py-16 sm:px-10"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Evidence, not guesswork</p><h2 className="mt-3 text-3xl font-bold text-[#1C1C1C] sm:text-4xl">Turn coordinates into a defensible screening brief.</h2></div><div className="grid gap-4 sm:grid-cols-2"><div className="border-l-2 border-[#1C1C1C] pl-4"><ShieldCheck className="h-5 w-5 text-[#1C1C1C]" /><p className="mt-3 text-sm font-bold">Risk-aware context</p><p className="mt-1 text-sm leading-6 text-slate-600">Relevant hazard, air, access, and local service signals appear only when they have useful evidence.</p></div><div className="border-l-2 border-[#1C1C1C] pl-4"><Leaf className="h-5 w-5 text-[#1C1C1C]" /><p className="mt-3 text-sm font-bold">Climate and land evidence</p><p className="mt-1 text-sm leading-6 text-slate-600">Historical climate, live outlooks, soil data, and carbon context support the next conversation with experts.</p></div></div></div></section>
    <section className="px-5 py-16 sm:px-10 sm:py-24"><div className="mx-auto max-w-6xl"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Why this matters</p><h2 className="mt-3 text-3xl font-bold text-[#1C1C1C] sm:text-4xl">Good land decisions start before a plan becomes irreversible.</h2><p className="mt-4 text-sm leading-7 text-slate-600">These events do not predict what will happen at a selected point. They show why location decisions need credible hazard, climate, terrain, and service context before people build, buy, or invest.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2">{disasterLessons.map((lesson) => <article key={lesson.place} className="border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{lesson.place}</p><h3 className="mt-3 text-lg font-bold text-[#1C1C1C]">{lesson.hazard}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{lesson.text}</p><a className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-slate-700 underline underline-offset-4 hover:text-[#1C1C1C]" href={lesson.href} target="_blank" rel="noreferrer">{lesson.source}<ExternalLink className="h-3.5 w-3.5" /></a></article>)}</div><p className="mt-6 text-xs leading-5 text-slate-500">TerraScope is a planning and screening tool, not a life-safety, evacuation, engineering, or legal-risk determination system. Verify decisions with local authorities and qualified professionals.</p></div></section>
    <footer className="px-5 py-10 sm:px-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-sm font-bold text-[#1C1C1C]"><div className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-white"><img src="/brand/terrascope-logo.png" alt="" className="h-full w-full scale-[1.45] object-cover" /></div>TerraScope</div><Link href="/workspace" className="text-sm font-bold text-slate-600 transition hover:text-[#1C1C1C]">Enter workspace</Link></div></footer>
    <section className="px-5 py-14 sm:px-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 border-t border-slate-300 pt-8 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Built by</p><p className="mt-2 text-xl font-bold text-[#1C1C1C]">stairmoss</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">TerraScope was built to make location intelligence accessible before time, capital, and planning are committed to a site.</p></div><div className="flex gap-2"><a href="https://github.com/stairmoss" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white/75 px-3 text-sm font-bold text-slate-700"><Github className="h-4 w-4" />GitHub</a><a href="https://www.linkedin.com/in/stairmoss" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white/75 px-3 text-sm font-bold text-slate-700"><Linkedin className="h-4 w-4" />LinkedIn</a></div></div></section>
  </main>;
}
