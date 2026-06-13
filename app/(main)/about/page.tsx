"use client";

import { useEffect, useState } from "react";
import { fetchLanguages } from "@/lib/api";
import { SponsorFooter } from "@/components/dashboard/sponsor-footer";
import {
  Search,
  BookOpen,
  GitMerge,
  Globe,
  Database,
  ExternalLink,
  Cpu,
  Shield,
  Video,
  Bot,
  Triangle,
  Feather,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Search,
    title: "Discover",
    description:
      "Autonomous agents scour the web for dictionaries, grammars, recordings, and academic papers in endangered languages.",
    color: "#1E40AF",
  },
  {
    icon: BookOpen,
    title: "Extract",
    description:
      "AI-powered extraction pulls vocabulary, grammar patterns, and audio from diverse sources into structured archives.",
    color: "#047857",
  },
  {
    icon: GitMerge,
    title: "Cross-Reference",
    description:
      "Intelligent verification links entries across sources, validating accuracy and building comprehensive language records.",
    color: "#6D28D9",
  },
];

const PIPELINE_STEPS = [
  {
    title: "Discovery",
    description:
      "Featherless-powered agents plan 6-tier dynamic queries and combine priority archives, verified public resource patterns, and optional SERP APIs, generating up to 24 targeted discovery paths per language.",
  },
  {
    title: "Crawl",
    description:
      "Each source is fetched through a 3-tier cascade: specialized crawlers, BrightData Web Unlocker for protected content, and Stagehand headless browser.",
  },
  {
    title: "Extraction",
    description:
      "Featherless processes each source in a schema-guided tool loop, extracting structured vocabulary entries, grammar patterns, IPA transcriptions, and conjugations.",
  },
  {
    title: "Cross-Reference",
    description:
      "A second Featherless agent searches for duplicate entries across sources, merging definitions and calculating reliability scores.",
  },
  {
    title: "Archive",
    description:
      "All data flows into Elasticsearch with Jina AI embeddings for semantic search, reranking, and knowledge graph generation.",
  },
  {
    title: "Revitalize",
    description:
      "Community reviewers validate entries, flag sensitive material, and generate classroom-ready lesson packs from the archive.",
  },
];

const DATA_SOURCES: {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}[] = [
  {
    title: "Glottolog",
    description:
      "The world's most comprehensive catalog of languages, with data on 5,352 endangered languages including geographic coordinates, endangerment status, and language family classification.",
    icon: ExternalLink,
    href: "https://glottolog.org",
  },
  {
    title: "Endangered Languages Project",
    description:
      "A collaborative platform documenting the world's endangered languages, providing endangerment assessments and preservation resources.",
    icon: ExternalLink,
    href: "https://endangeredlanguages.com",
  },
  {
    title: "Community Sources",
    description:
      "Dictionaries, academic papers, YouTube content, government archives, and wiki resources discovered autonomously by our AI agents.",
    icon: Globe,
  },
];

const PARTNERS: { name: string; icon: LucideIcon }[] = [
  { name: "Featherless.ai", icon: Feather },
  { name: "Elastic + JINA", icon: Search },
  { name: "Browserbase", icon: Globe },
  { name: "BrightData", icon: Database },
  { name: "Runpod", icon: Cpu },
  { name: "Cloudflare", icon: Shield },
  { name: "HeyGen", icon: Video },
  { name: "Fetch.ai", icon: Bot },
  { name: "Vercel", icon: Triangle },
];

// ── Section Divider ──────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-px bg-border/30" />
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 shrink-0 select-none">
        {label}
      </p>
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const [stats, setStats] = useState({
    totalEndangered: 0,
    criticallyEndangered: 0,
    preserved: 0,
  });

  useEffect(() => {
    fetchLanguages({ limit: 1 }).then((data) => {
      setStats({
        totalEndangered: data.stats.total_endangered,
        criticallyEndangered: data.stats.critically_endangered,
        preserved: data.stats.with_preservation_data,
      });
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm px-5 py-2.5">
        <h1 className="font-serif text-[15px] tracking-tight text-foreground/80 select-none">
          About
        </h1>
      </header>

      {/* ── Scrollable Content ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-14">
          {/* ── Hero / Mission ──────────────────────────────────── */}
          <section className="mb-16">
            <h2 className="font-serif text-4xl md:text-[2.75rem] leading-[1.15] tracking-tight text-foreground mb-3">
              Every language is a universe{" "}
              <br className="hidden sm:block" />
              of thought.
            </h2>
            <p className="font-serif italic text-xl md:text-2xl text-primary/70 mb-8">
              A LingHacks VII edition for keeping them alive.
            </p>

            {/* Decorative rule */}
            <div className="w-12 h-px bg-primary/30 mb-8" />

            <p className="text-[15px] leading-[1.8] text-muted-foreground max-w-2xl">
              A language dies every two weeks. By 2100, UNESCO estimates half of
              the world&rsquo;s ~7,000 languages will be extinct &mdash; each
              taking with it centuries of irreplaceable knowledge, oral history,
              and cultural identity. The resources to preserve these languages
              exist, but they&rsquo;re scattered across obscure PDFs, YouTube
              videos, academic papers, and dictionary websites. LangSafe
              deploys AI agents that autonomously discover, extract, and
              cross-reference these scattered fragments into a unified,
              searchable archive. This LingHacks build adds community review
              and lesson generation so preservation can become revitalization.
            </p>
          </section>

          {/* ── Stats ───────────────────────────────────────────── */}
          <section className="mb-16">
            <SectionDivider label="At a glance" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
              {[
                {
                  value: stats.totalEndangered,
                  suffix: "+",
                  label: "Languages at Risk",
                  color: "#F97316",
                },
                {
                  value: stats.criticallyEndangered,
                  label: "Critically Endangered",
                  color: "#DC2626",
                },
                {
                  value: stats.preserved,
                  label: "Preserved",
                  color: "#047857",
                },
                {
                  value: 100,
                  suffix: "%",
                  label: "Fully Automated",
                  color: "#0A84FF",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center gap-2 py-4"
                >
                  <span className="font-serif text-3xl tabular-nums text-foreground">
                    {stat.value.toLocaleString()}
                    {stat.suffix}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: stat.color }}
                    />
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      {stat.label}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ── How It Works ─────────────────────────────────────── */}
          <section className="mb-16">
            <SectionDivider label="How it works" />

            <div className="grid md:grid-cols-3 gap-5 mt-8">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative rounded-lg border border-border/40 bg-card/50 p-6 transition-all duration-200 hover:border-border/70 hover:shadow-sm"
                >
                  {/* Colored accent line */}
                  <div
                    className="absolute top-0 left-6 right-6 h-px"
                    style={{
                      backgroundColor: feature.color,
                      opacity: 0.35,
                    }}
                  />

                  {/* Icon */}
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-md mb-4"
                    style={{ backgroundColor: `${feature.color}10` }}
                  >
                    <feature.icon
                      className="h-4 w-4"
                      style={{ color: feature.color }}
                    />
                  </div>

                  <h3 className="font-serif text-base tracking-tight text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── The Pipeline ──────────────────────────────────────── */}
          <section className="mb-16">
            <SectionDivider label="The pipeline" />

            <div className="mt-8 space-y-0">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.title} className="relative flex gap-5 group">
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center shrink-0">
                    {/* Number circle */}
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background text-xs font-mono font-semibold text-muted-foreground group-hover:border-primary/40 group-hover:text-primary transition-colors">
                      {i + 1}
                    </div>
                    {/* Connecting line */}
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-border/30 my-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-8 pt-1">
                    <h4 className="font-serif text-[15px] tracking-tight text-foreground mb-1.5">
                      {step.title}
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Data Sources ──────────────────────────────────────── */}
          <section className="mb-16">
            <SectionDivider label="Data sources" />

            <div className="grid gap-4 mt-8">
              {DATA_SOURCES.map((source) => {
                const content = (
                  <div
                    className="group rounded-lg border border-border/40 bg-card/50 p-5 transition-all duration-200 hover:border-border/70 hover:shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary/50 shrink-0 mt-0.5">
                        <source.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif text-[15px] tracking-tight text-foreground mb-1 flex items-center gap-2">
                          {source.title}
                          {source.href && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                          )}
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {source.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );

                if (source.href) {
                  return (
                    <a
                      key={source.title}
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {content}
                    </a>
                  );
                }

                return <div key={source.title}>{content}</div>;
              })}
            </div>
          </section>

          {/* ── Built With ────────────────────────────────────────── */}
          <section className="mb-8">
            <SectionDivider label="Built with" />

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-8">
              {PARTNERS.map(({ name, icon: Icon }) => (
                <div
                  key={name}
                  className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-card/30 px-3.5 py-2.5 transition-colors hover:border-border/50 hover:bg-card/60"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  <span className="text-xs font-medium text-muted-foreground/70 whitespace-nowrap">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <SponsorFooter />
      </div>
    </div>
  );
}
