"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { AgentFeed } from "@/components/agent-feed/agent-feed";
import { SearchPanel } from "@/components/search/search-panel";
import { StatsBar } from "@/components/dashboard/stats-bar";
import { SponsorFooter } from "@/components/dashboard/sponsor-footer";
import { useAgentEventsContext } from "@/lib/websocket";
import { useActiveLanguage } from "@/lib/active-language";
import { ResizableLayout } from "@/components/ui/resizable-layout";
import { PreservationDialog } from "@/components/search/PreservationDialog";
import { fetchLanguages } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Zap, Search, BookOpen, GitMerge, GraduationCap } from "lucide-react";
import type { LanguageEntry, LanguageMetadata } from "@/lib/types";

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

export default function Home() {
  return <DashboardContent />;
}

function DashboardContent() {
  const { startPipeline } = useAgentEventsContext();
  const { activeLanguage, setActiveLanguage } = useActiveLanguage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const autoStarted = useRef(false);

  // Auto-start pipeline when navigated from a language detail page
  useEffect(() => {
    if (autoStarted.current) return;
    const shouldAutoStart = sessionStorage.getItem("tk-auto-start");
    if (shouldAutoStart && activeLanguage) {
      autoStarted.current = true;
      sessionStorage.removeItem("tk-auto-start");
      startPipeline(buildMetadata(activeLanguage));
    }
  }, [activeLanguage, startPipeline]);

  const isArchiveMode = activeLanguage !== null;

  const handleDialogStart = useCallback(
    (selected: LanguageEntry) => {
      setActiveLanguage(selected);
      setDialogOpen(false);
      startPipeline(buildMetadata(selected));
    },
    [setActiveLanguage, startPipeline]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top bar — only shown when a language is active */}
      {isArchiveMode && (
        <header className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-5 py-2.5" style={{ backgroundColor: "#F0EAE1" }}>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif text-[15px] tracking-tight text-foreground/80 select-none">
              Preservation Dashboard
            </h1>
          </div>
          <StatsBar languageCode={activeLanguage?.iso_code} />
        </header>
      )}

      {/* Main content */}
      {isArchiveMode ? (
        <ResizableLayout
          defaultLeftPercent={30}
          minLeftPercent={20}
          maxLeftPercent={50}
          left={<AgentFeed />}
          right={<SearchPanel language={activeLanguage ?? undefined} />}
        />
      ) : (
        <WelcomeView onBeginClick={() => setDialogOpen(true)} />
      )}

      {/* Footer */}
      <SponsorFooter />

      {/* Language selector dialog */}
      <PreservationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStart={handleDialogStart}
      />
    </div>
  );
}

// ── Animation Variants ──────────────────────────────────────────────────────

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

// ── Animated Count-Up ───────────────────────────────────────────────────────

function AnimatedCount({
  target,
  suffix = "",
}: {
  target: number;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || target === 0) return;
    const duration = 1800;
    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── Feature Cards Config ────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Search,
    title: "Discover",
    description:
      "Autonomous agents scour the web for dictionaries, grammars, and recordings in endangered languages.",
    color: "#1E40AF",
  },
  {
    icon: BookOpen,
    title: "Extract",
    description:
      "AI-powered extraction pulls vocabulary and grammar patterns from diverse sources into structured archives.",
    color: "#047857",
  },
  {
    icon: GitMerge,
    title: "Cross-Reference",
    description:
      "Intelligent verification links entries across sources, validating accuracy and building comprehensive records.",
    color: "#6D28D9",
  },
];

// ── Welcome View ────────────────────────────────────────────────────────────

function WelcomeView({ onBeginClick }: { onBeginClick: () => void }) {
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
    <div className="flex flex-1 flex-col items-center overflow-y-auto">
      <div className="flex flex-col items-center w-full max-w-3xl px-6 py-16">
        <motion.div
          className="flex flex-col items-center w-full"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {/* ── Heading ── */}
          <motion.div variants={fadeUp} className="text-center mb-10">
            <h2 className="font-serif text-4xl tracking-tight text-foreground mb-4">
              Preserve, Verify, Teach
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Autonomous AI agents discover, extract, and cross-reference
              linguistic data from across the web, then turn archive entries
              into community-reviewed learning materials.
            </p>
          </motion.div>

          {/* ── Live Stats ── */}
          <motion.div variants={fadeUp} className="w-full mb-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-border/30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 shrink-0 select-none">
                The scale of what&apos;s at stake
              </p>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            <div className="grid grid-cols-3 gap-8 text-center">
              {[
                {
                  value: stats.totalEndangered,
                  suffix: "+",
                  label: "Languages at Risk",
                },
                {
                  value: stats.criticallyEndangered,
                  suffix: "",
                  label: "Critically Endangered",
                },
                {
                  value: stats.preserved,
                  suffix: "",
                  label: "Preserved by LangSafe",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span className="font-serif text-3xl tabular-nums text-foreground">
                    <AnimatedCount
                      target={stat.value}
                      suffix={stat.suffix}
                    />
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── CTA ── */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: {
                opacity: 1,
                y: 0,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 24,
                },
              },
            }}
            className="mb-12 flex flex-wrap items-center justify-center gap-3"
          >
            <Button
              onClick={onBeginClick}
              size="lg"
              className="gap-2 px-8 py-5 text-[15px] font-medium rounded-lg shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
            >
              <Zap className="h-4 w-4" />
              Begin Preservation
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 px-6 py-5 text-[15px] rounded-lg">
              <Link href="/studio">
                <GraduationCap className="h-4 w-4" />
                Open Studio
              </Link>
            </Button>
          </motion.div>

          {/* ── How It Works ── */}
          <motion.div variants={fadeUp} className="w-full mb-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="flex-1 h-px bg-border/30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 shrink-0 select-none">
                How it works
              </p>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            <div className="grid grid-cols-3 gap-10">
              {FEATURES.map((feature, i) => {
                const stepNum = String(i + 1).padStart(2, "0");
                return (
                  <motion.div
                    key={feature.title}
                    className="text-left"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.12 }}
                  >
                    {/* Step number */}
                    <span
                      className="font-serif text-5xl leading-none select-none"
                      style={{ color: feature.color, opacity: 0.15 }}
                    >
                      {stepNum}
                    </span>

                    {/* Accent line */}
                    <div
                      className="h-px w-12 mt-3 mb-4"
                      style={{ backgroundColor: feature.color, opacity: 0.4 }}
                    />

                    {/* Icon + Title */}
                    <div className="flex items-center gap-2 mb-2">
                      <feature.icon
                        className="h-4 w-4"
                        style={{ color: feature.color }}
                      />
                      <h3 className="font-serif text-[15px] tracking-tight text-foreground">
                        {feature.title}
                      </h3>
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
                      {feature.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* ── Footer tagline ── */}
          <motion.p
            variants={fadeUp}
            className="text-[11px] text-muted-foreground/40 text-center"
          >
            Built for LingHacks VII
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
