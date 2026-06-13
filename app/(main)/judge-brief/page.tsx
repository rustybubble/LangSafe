import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Globe2,
  Lightbulb,
  Network,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const RUBRIC = [
  {
    title: "Creativity",
    icon: Lightbulb,
    color: "#6D28D9",
    copy:
      "Autonomous preservation agents plus a community-facing studio: not just finding words, but turning scattered sources into living lessons.",
  },
  {
    title: "Impact",
    icon: UsersRound,
    color: "#047857",
    copy:
      "Endangered-language communities, teachers, and heritage learners get archives, review workflows, and lesson packs from the same pipeline.",
  },
  {
    title: "Feasibility",
    icon: CheckCircle2,
    color: "#1E40AF",
    copy:
      "The demo works without API keys through a full Jejueo fallback dataset, while live services can power real discovery and extraction.",
  },
  {
    title: "Technology",
    icon: Cpu,
    color: "#0A84FF",
    copy:
      "Next.js 16, React 19, Socket.io, Elasticsearch hybrid retrieval, Jina embeddings, Featherless.ai lesson generation, Claude agents, and map/graph visualizations.",
  },
  {
    title: "UI/UX",
    icon: Sparkles,
    color: "#2563EB",
    copy:
      "A clean blue interface with map browsing, live agent observability, searchable sources, graph exploration, and explicit human verification.",
  },
] as const;

const DEMO_FLOW = [
  "Open the Dashboard and choose Jejueo.",
  "Run the preservation demo and watch the agent feed fill in.",
  "Search for sea, haenyeo, or badang in the Archive tab.",
  "Open Graph and Sources to show provenance and relationships.",
  "Finish in Studio by verifying entries and generating a lesson pack.",
];

const STACK = [
  "Next.js 16",
  "React 19",
  "Socket.io",
  "Elasticsearch",
  "Jina AI",
  "Featherless.ai",
  "Claude tool-use agents",
  "Perplexity Sonar",
  "BrightData",
  "Browserbase Stagehand",
  "Leaflet",
  "react-force-graph",
  "Cloudflare R2/KV",
];

export default function JudgeBriefPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/40 bg-background/80 px-5 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h1 className="font-serif text-[17px] tracking-tight">
                Judge Brief
              </h1>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                LingHacks VII
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Computational linguistics for endangered-language preservation and revitalization.
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/studio">
                Studio
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">
                Demo
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-5 py-6">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/70">
                Project thesis
              </p>
              <h2 className="mt-2 font-serif text-4xl leading-tight tracking-tight text-foreground">
                AI agents preserve the archive. Communities decide what lives in it.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                LangSafe LingHacks turns endangered-language data scattered
                across dictionaries, papers, videos, and oral-history archives
                into searchable vocabulary, grammar, source provenance, graph
                relationships, and teaching material.
              </p>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <h3 className="font-serif text-lg tracking-tight">Demo flow</h3>
              </div>
              <ol className="space-y-2">
                {DEMO_FLOW.map((step, index) => (
                  <li key={step} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-3 flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-lg tracking-tight">
                Rubric Alignment
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {RUBRIC.map(({ title, icon: Icon, color, copy }) => (
                <div
                  key={title}
                  className="rounded-lg border border-border/50 bg-card/70 p-4"
                >
                  <div
                    className="mb-3 flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${color}12` }}
                  >
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <h4 className="font-serif text-base tracking-tight">{title}</h4>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-card/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-emerald-700" />
                <h3 className="font-serif text-lg tracking-tight">Impact Model</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ImpactStat value="3,142" label="at-risk languages indexed in demo mode" />
                <ImpactStat value="4,214" label="Jejueo entries represented in run artifact" />
                <ImpactStat value="266" label="audio clips in preservation metrics" />
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Network className="h-4 w-4 text-blue-700" />
                <h3 className="font-serif text-lg tracking-tight">Technology Stack</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {STACK.map((item) => (
                  <Badge key={item} variant="outline" className="bg-background/50">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-7 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-foreground/80">
                Provenance note: this LingHacks edition is adapted from the
                earlier preservation codebase and adds hackathon-specific
                demo reliability, visual framing, judge brief, community review,
                and Featherless.ai lesson-generation workflow.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ImpactStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/50 px-3 py-3">
      <div className="font-serif text-2xl leading-none text-foreground">{value}</div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}
