"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fetchLanguage } from "@/lib/api";
import {
  LanguageEntry,
  ENDANGERMENT_COLORS,
} from "@/lib/types";
import { useAgentEventsContext } from "@/lib/websocket";
import { useActiveLanguage } from "@/lib/active-language";
import type { LanguageMetadata } from "@/lib/types";
import { SearchPanel } from "@/components/search/search-panel";
import { RunHistory } from "@/components/pipeline/RunHistory";
import { EndangermentBadge } from "@/components/languages/EndangermentBadge";
import { fetchStats } from "@/lib/api";
import type { LanguageStats } from "@/lib/types";
import { MOCK_STATS } from "@/lib/mock-events";
import { LanguageOverviewSection } from "@/components/languages/LanguageOverview";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Users,
  Globe,
  Zap,
  AlertCircle,
  BookOpen,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Mini map (dynamic, SSR disabled for Leaflet) ─────────────────────────────

const MiniMap = dynamic(
  () => import("@/components/languages/MiniMap").then((m) => m.MiniMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-72 rounded-xl bg-[#1a1a2e] border border-border/30 flex items-center justify-center">
        <Globe className="h-5 w-5 text-white/20 animate-pulse" />
      </div>
    ),
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function countryToFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function formatSpeakers(count: number | null): string {
  if (count == null) return "Unknown";
  if (count === 0) return "No living speakers";
  return `~${count.toLocaleString()} speakers`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LanguageDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <LanguageDetailContent />
    </Suspense>
  );
}

function LanguageDetailContent() {
  const params = useParams();
  const glottocode = params.glottocode as string;
  const [language, setLanguage] = useState<LanguageEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setNotFound(false);
    fetchLanguage(glottocode)
      .then((data) => setLanguage(data))
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [glottocode]);

  if (isLoading) return <DetailSkeleton />;
  if (notFound || !language) return <NotFoundState glottocode={glottocode} />;

  return (
    <motion.div
      className="flex h-full flex-col overflow-y-auto bg-background"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.1 } },
      }}
    >
      {/* Header bar */}
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 16 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        <LanguageHeader language={language} />
      </motion.div>

      {/* AI-generated language overview */}
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 16 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        <LanguageOverviewSection language={language} />
      </motion.div>

      {/* Pipeline run history */}
      {language.preservation_status.vocabulary_entries > 0 && (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
          }}
        >
          <RunHistory languageCode={language.iso_code} />
        </motion.div>
      )}

      {/* Main content: archive or empty state */}
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 16 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        }}
      >
        <LanguageBody language={language} />
      </motion.div>
    </motion.div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function buildMetadata(lang: LanguageEntry): LanguageMetadata {
  return {
    language_name: lang.name,
    language_code: lang.iso_code,
    glottocode: lang.glottocode,
    native_name: lang.alternate_names?.[0],
    alternate_names: lang.alternate_names,
    macroarea: lang.macroarea,
    language_family: lang.language_family,
    countries: lang.countries,
    contact_languages: lang.contact_languages,
    endangerment_status: lang.endangerment_status,
    speaker_count: lang.speaker_count,
  };
}

const STAT_ITEMS: {
  key: keyof LanguageStats;
  label: string;
  format?: (v: number) => string;
}[] = [
  { key: "total_entries", label: "Entries" },
  { key: "total_sources", label: "Sources" },
  { key: "total_audio_clips", label: "Audio" },
  { key: "grammar_patterns", label: "Grammar" },
  { key: "coverage_percentage", label: "Coverage", format: (v) => `${v}%` },
];

function LanguageHeader({ language }: { language: LanguageEntry }) {
  const router = useRouter();
  const { startPipeline, pipelineStatus, stats: liveStats } = useAgentEventsContext();
  const color = ENDANGERMENT_COLORS[language.endangerment_status];

  // Stats data
  const [stats, setStats] = useState<LanguageStats>(MOCK_STATS);

  useEffect(() => {
    let cancelled = false;
    fetchStats(language.iso_code).then((data) => {
      if (!cancelled) setStats(data);
    });
    const interval = setInterval(() => {
      fetchStats(language.iso_code).then((data) => {
        if (!cancelled) setStats(data);
      });
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [language.iso_code]);

  useEffect(() => {
    if (pipelineStatus === "complete" || pipelineStatus === "error") {
      const timer = setTimeout(() => {
        fetchStats(language.iso_code).then(setStats);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pipelineStatus, language.iso_code]);

  const isLive = pipelineStatus === "running";

  const handlePreservation = useCallback(() => {
    startPipeline(buildMetadata(language));
  }, [startPipeline, language]);

  return (
    <header className="shrink-0 bg-background/80 backdrop-blur-sm">
      {/* Endangerment accent line */}
      <div className="h-0.5" style={{ backgroundColor: color }} />

      {/* Back nav */}
      <div className="px-6 py-2">
        <button
          onClick={() => router.push("/languages")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Languages
        </button>
      </div>

      {/* Hero: metadata + map */}
      <div className="flex items-start justify-between gap-8 px-6 pb-6">
        {/* Left: language profile */}
        <div className="flex flex-col min-w-0">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">
            {language.name}
          </h1>

          {/* Badge + codes */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <EndangermentBadge status={language.endangerment_status} />
            <span className="text-border/50">|</span>
            <span className="text-xs text-muted-foreground font-mono">
              {language.iso_code} · {language.glottocode}
            </span>
            <span className="text-border/50">|</span>
            <span className="text-xs text-muted-foreground">
              {language.language_family} · {language.macroarea}
            </span>
          </div>

          {/* Speakers + countries */}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {formatSpeakers(language.speaker_count)}
            </span>
            {language.countries?.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span title={language.countries.join(", ")}>
                  {language.countries.map(countryToFlag).join(" ")}
                </span>
              </>
            )}
          </div>

          {/* Inline stats row */}
          <div className="mt-5 flex items-baseline gap-8">
            {STAT_ITEMS.map((item) => {
              let value = stats[item.key] as number;
              if (isLive && item.key === "total_entries") value += liveStats.vocabulary;
              if (isLive && item.key === "total_sources") value += liveStats.sources;
              if (isLive && item.key === "total_audio_clips") value += liveStats.audioClips;
              const display = item.format ? item.format(value) : value.toLocaleString();

              return (
                <div key={item.key} className="flex flex-col">
                  <span className="font-serif text-2xl text-foreground tabular-nums">
                    {display}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mt-0.5">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-5">
            <Button
              size="sm"
              variant={pipelineStatus === "running" ? "outline" : "default"}
              onClick={handlePreservation}
              disabled={pipelineStatus === "running" || pipelineStatus === "complete"}
              className="h-8 gap-1.5 text-xs"
            >
              {pipelineStatus === "running" ? (
                <>
                  <Zap className="h-3 w-3 animate-pulse" />
                  Preserving...
                </>
              ) : pipelineStatus === "complete" ? (
                <>
                  <BookOpen className="h-3 w-3" />
                  Preserved
                </>
              ) : (
                <>
                  <Zap className="h-3 w-3" />
                  Run Preservation
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right: mini map */}
        {language.latitude != null && language.longitude != null && (
          <div className="shrink-0 hidden md:block">
            <MiniMap
              latitude={language.latitude}
              longitude={language.longitude}
              color={ENDANGERMENT_COLORS[language.endangerment_status]}
              languageName={language.name}
              className="h-48 w-72"
            />
          </div>
        )}
      </div>

      {/* Bottom border */}
      <div className="h-px bg-border/30" />
    </header>
  );
}

// ── Body (archive or empty state) ────────────────────────────────────────────

function LanguageBody({ language }: { language: LanguageEntry }) {
  const router = useRouter();
  const { setActiveLanguage } = useActiveLanguage();
  const { pipelineStatus, clearEvents } = useAgentEventsContext();
  const hasData = language.preservation_status.vocabulary_entries > 0;
  const isActive = pipelineStatus === "running" || pipelineStatus === "complete";

  const handleGoToDashboard = useCallback(() => {
    clearEvents();
    setActiveLanguage(language);
    router.push("/dashboard");
  }, [language, router, setActiveLanguage, clearEvents]);

  if (hasData || isActive) {
    return <SearchPanel language={language} embedded onNavigateToDashboard={handleGoToDashboard} />;
  }

  return <EmptyState language={language} />;
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ language }: { language: LanguageEntry }) {
  const router = useRouter();
  const { setActiveLanguage } = useActiveLanguage();
  const { clearEvents } = useAgentEventsContext();

  const handlePreservation = useCallback(() => {
    // Set active language in context and flag auto-start for dashboard
    clearEvents();
    setActiveLanguage(language);
    sessionStorage.setItem("tk-auto-start", "true");
    router.push("/dashboard");
  }, [language, router, setActiveLanguage, clearEvents]);

  const handleGoToDashboard = useCallback(() => {
    clearEvents();
    setActiveLanguage(language);
    router.push("/dashboard");
  }, [language, router, setActiveLanguage, clearEvents]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4 max-w-md">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>

        {/* Title */}
        <div>
          <h2 className="font-serif text-lg text-foreground mb-1">
            No preservation data yet
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            LangSafe&apos;s AI agents will discover and compile vocabulary,
            grammar patterns, and audio recordings for{" "}
            <strong>{language.name}</strong>.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-2 flex items-center gap-3">
          <Button
            onClick={handlePreservation}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            Begin Preservation
          </Button>
          <Button
            variant="outline"
            onClick={handleGoToDashboard}
            className="gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Go to Dashboard
          </Button>
        </div>

        {/* Subtext */}
        <p className="text-xs text-muted-foreground/60 max-w-sm">
          This process may take a while depending on available sources. You&apos;ll see real-time
          updates as agents discover sources and extract vocabulary.
        </p>
      </div>
    </div>
  );
}

// ── Not Found ────────────────────────────────────────────────────────────────

function NotFoundState({ glottocode }: { glottocode: string }) {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <h2 className="font-serif text-lg text-foreground mb-1">
            Language not found
          </h2>
          <p className="text-sm text-muted-foreground">
            No language with glottocode{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {glottocode}
            </code>{" "}
            was found in our database.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/languages")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Languages
        </Button>
      </div>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header skeleton */}
      <header className="shrink-0 px-6">
        <div className="h-0.5 bg-muted/30 -mx-6" />
        <div className="py-2">
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-start justify-between gap-8 pb-6">
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-10 w-56" />
            <div className="flex gap-3 items-center mt-1">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-40 mt-1" />
            <div className="flex gap-8 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
              ))}
            </div>
            <Skeleton className="h-8 w-32 rounded-md mt-4" />
          </div>
          <Skeleton className="h-48 w-72 rounded-xl hidden md:block shrink-0" />
        </div>
        <div className="h-px bg-border/30 -mx-6" />
      </header>

      {/* Overview skeleton */}
      <div className="border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2 mb-5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      </div>

      {/* Body skeleton */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-40 rounded-md mt-2" />
        </div>
      </div>
    </div>
  );
}
