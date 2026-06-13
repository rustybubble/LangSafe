"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe,
  BookOpen,
  Mic,
  Unlock,
  Lightbulb,
  Search,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/agent-feed/counter-bar";
import { useAgentEventsContext } from "@/lib/websocket";
import {
  AGENT_COLORS,
  AGENT_LABELS,
  ENDANGERMENT_COLORS,
  ENDANGERMENT_LABELS,
} from "@/lib/types";
import type { LanguageEntry, AgentEvent, AgentType } from "@/lib/types";
import type { AgentEventStats } from "@/lib/websocket";

// ── Types ────────────────────────────────────────────────────────────────────

interface ArchiveBuildingProps {
  language?: LanguageEntry;
  stats: AgentEventStats;
}

// ── Static tidbits ──────────────────────────────────────────────────────────

const GENERAL_TIDBITS = [
  "A language dies roughly every two weeks — taking with it centuries of oral history.",
  "Over 7,000 languages are spoken worldwide. Nearly half are considered endangered.",
  "Language preservation captures not just words, but entire worldviews and ways of understanding the world.",
  "Many endangered languages have no written form — oral traditions are the sole carrier of their heritage.",
  "When a language disappears, unique knowledge about medicine, ecology, and local geography often vanishes with it.",
  "Some languages have words for concepts that don't exist in any other language.",
  "UNESCO classifies language vitality across 9 factors, from intergenerational transmission to government policy.",
  "Language revitalization has succeeded in cases like Hebrew and Hawaiian, giving hope for other endangered languages.",
  "Indigenous languages encode millennia of ecological knowledge about local plants, animals, and weather patterns.",
  "Digital preservation allows future generations to hear, study, and potentially revive dormant languages.",
];

function buildLanguageTidbits(lang?: LanguageEntry): string[] {
  if (!lang) return [];
  const tidbits: string[] = [];

  if (lang.language_family) {
    tidbits.push(
      `${lang.name} belongs to the ${lang.language_family} language family.`
    );
  }
  if (lang.speaker_count != null && lang.speaker_count > 0) {
    tidbits.push(
      `Approximately ${lang.speaker_count.toLocaleString()} people speak ${lang.name}.`
    );
  } else if (lang.speaker_count === 0) {
    tidbits.push(
      `${lang.name} currently has no known living speakers — preservation efforts focus on existing recordings and documentation.`
    );
  }
  if (lang.macroarea) {
    tidbits.push(`${lang.name} is spoken in the ${lang.macroarea} region.`);
  }
  if (lang.countries?.length === 1) {
    tidbits.push(
      `${lang.name} is primarily spoken in ${lang.countries[0]}.`
    );
  } else if (lang.countries && lang.countries.length > 1) {
    tidbits.push(
      `${lang.name} is spoken across ${lang.countries.length} countries: ${lang.countries.join(", ")}.`
    );
  }
  if (lang.alternate_names?.length) {
    tidbits.push(
      `${lang.name} is also known as ${lang.alternate_names.slice(0, 3).join(", ")}${lang.alternate_names.length > 3 ? `, and ${lang.alternate_names.length - 3} other names` : ""}.`
    );
  }
  if (lang.endangerment_status === "critically_endangered") {
    tidbits.push(
      `${lang.name} is critically endangered — the youngest speakers are grandparents or older.`
    );
  } else if (lang.endangerment_status === "severely_endangered") {
    tidbits.push(
      `${lang.name} is severely endangered — spoken mainly by the grandparent generation and older.`
    );
  } else if (lang.endangerment_status === "definitely_endangered") {
    tidbits.push(
      `${lang.name} is definitely endangered — children no longer learn it as a mother tongue.`
    );
  }
  if (lang.contact_languages?.length) {
    tidbits.push(
      `${lang.name} has historically been in contact with ${lang.contact_languages.slice(0, 3).join(", ")}.`
    );
  }

  return tidbits;
}

// ── Pipeline stage config ───────────────────────────────────────────────────

const STAGES = [
  {
    key: "discovery" as const,
    label: "Discovering",
    doneLabel: "Discovered",
    icon: Globe,
    color: AGENT_COLORS.discovery,
  },
  {
    key: "extraction" as const,
    label: "Extracting",
    doneLabel: "Extracted",
    icon: Search,
    color: AGENT_COLORS.extraction,
  },
  {
    key: "cross_reference" as const,
    label: "Cross-referencing",
    doneLabel: "Verified",
    icon: Link2,
    color: AGENT_COLORS.cross_reference,
  },
] as const;

// ── Stat card config ────────────────────────────────────────────────────────

const STAT_CARDS = [
  { key: "sources" as const, label: "Sources", icon: Globe, color: AGENT_COLORS.discovery },
  { key: "vocabulary" as const, label: "Vocabulary", icon: BookOpen, color: AGENT_COLORS.extraction },
  { key: "audioClips" as const, label: "Audio Clips", icon: Mic, color: "#DC2626" },
  { key: "brightdataUnlocks" as const, label: "Unlocked", icon: Unlock, color: "#0066FF" },
] as const;

// ── Format event action text ────────────────────────────────────────────────

function formatEventAction(event: AgentEvent): string {
  if (event.data.message) return event.data.message;
  const action = event.action.replace(/_/g, " ");
  if (event.data.title) return `${action}: ${event.data.title}`;
  if (event.data.url) {
    try {
      return `${action}: ${new URL(event.data.url).hostname}`;
    } catch {
      return action;
    }
  }
  return action;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Shimmer keyframes (CSS-in-JS for the indeterminate progress bar) ────────

const shimmerStyle = `
@keyframes archiveShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;

// ── Component ───────────────────────────────────────────────────────────────

export function ArchiveBuilding({ language, stats }: ArchiveBuildingProps) {
  const { events } = useAgentEventsContext();
  const [tidbitIndex, setTidbitIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const feedRef = useRef<HTMLDivElement>(null);

  // Build and shuffle tidbits
  const tidbits = useMemo(() => {
    const specific = buildLanguageTidbits(language);
    const all = [...specific, ...GENERAL_TIDBITS];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [language]);

  // Rotate tidbits
  useEffect(() => {
    if (tidbits.length <= 1) return;
    const interval = setInterval(() => {
      setTidbitIndex((prev) => (prev + 1) % tidbits.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [tidbits.length]);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll activity feed
  const scrollFeed = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollFeed();
  }, [events.length, scrollFeed]);

  // Pipeline stage states
  const discoveryActive = stats.sources > 0;
  const extractionActive = stats.vocabulary > 0 || stats.audioClips > 0;
  const crossRefActive = stats.vocabulary > 2;
  const stageActive = [discoveryActive, extractionActive, crossRefActive];

  // Last 8 events for activity feed
  const recentEvents = useMemo(
    () => events.slice(-8),
    [events]
  );

  // Endangerment styling
  const endangermentStatus = language?.endangerment_status;
  const endangermentColor = endangermentStatus
    ? ENDANGERMENT_COLORS[endangermentStatus]
    : undefined;
  const endangermentLabel = endangermentStatus
    ? ENDANGERMENT_LABELS[endangermentStatus]
    : undefined;

  return (
    <>
      <style>{shimmerStyle}</style>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-1 flex-col px-5 py-4 gap-5 overflow-y-auto"
      >
        {/* ── 1. Language Header Bar ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-serif text-xl tracking-tight text-foreground truncate">
              {language?.name || "Language Archive"}
            </h2>
            {endangermentLabel && endangermentColor && (
              <Badge
                variant="outline"
                className="shrink-0 border-0 px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${endangermentColor}15`,
                  color: endangermentColor,
                }}
              >
                {endangermentLabel}
              </Badge>
            )}
          </div>

          {/* Elapsed timer pill */}
          <div className="flex items-center gap-2 shrink-0 rounded-full border border-border/50 bg-muted/30 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatTime(elapsed)}
            </span>
          </div>
        </motion.div>

        {/* ── 2. Pipeline Stage Stepper ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex items-stretch gap-0"
        >
          {STAGES.map((stage, i) => {
            const active = stageActive[i];
            const isCurrent =
              active && (i === STAGES.length - 1 || !stageActive[i + 1]);
            const isDone = active && !isCurrent;
            const Icon = stage.icon;

            return (
              <div key={stage.key} className="flex items-stretch flex-1 min-w-0">
                <div className="flex flex-col flex-1 min-w-0">
                  {/* Stage header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-t-lg border border-b-0 transition-all duration-500"
                    style={{
                      borderColor: active ? `${stage.color}30` : "var(--border)",
                      backgroundColor: active ? `${stage.color}08` : "transparent",
                    }}
                  >
                    <div
                      className="flex items-center justify-center h-5 w-5 rounded-full shrink-0 transition-all duration-500"
                      style={{
                        backgroundColor: active ? `${stage.color}18` : "var(--muted)",
                      }}
                    >
                      <Icon
                        className="h-3 w-3 transition-colors duration-500"
                        style={{ color: active ? stage.color : "var(--muted-foreground)" }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider truncate transition-colors duration-500"
                      style={{ color: active ? stage.color : "var(--muted-foreground)" }}
                    >
                      {isDone ? stage.doneLabel : stage.label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="h-1 rounded-b-lg overflow-hidden transition-colors duration-500"
                    style={{
                      backgroundColor: active ? `${stage.color}15` : "var(--muted)",
                    }}
                  >
                    {isDone && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-b-lg"
                        style={{ backgroundColor: stage.color }}
                      />
                    )}
                    {isCurrent && (
                      <div className="relative h-full w-full">
                        <div
                          className="absolute inset-0 h-full w-1/3 rounded-b-lg"
                          style={{
                            backgroundColor: stage.color,
                            animation: "archiveShimmer 1.5s ease-in-out infinite",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Connector line */}
                {i < STAGES.length - 1 && (
                  <div className="flex items-center px-1 self-center">
                    <div
                      className="h-px w-3 transition-colors duration-500"
                      style={{
                        backgroundColor: stageActive[i + 1]
                          ? STAGES[i + 1].color
                          : "var(--border)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>

        {/* ── 3. Main Content Grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Left: 2x2 Stat Cards */}
          <div className="grid grid-cols-2 gap-2.5 content-start">
            {STAT_CARDS.map((card, i) => {
              const value = stats[card.key];
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.key}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.35 }}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-card/50 py-4 px-3"
                >
                  <div
                    className="flex items-center justify-center h-8 w-8 rounded-lg"
                    style={{ backgroundColor: `${card.color}12` }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: card.color }}
                    />
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    <AnimatedNumber
                      value={value}
                      color={value > 0 ? card.color : "var(--muted-foreground)"}
                    />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {card.label}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Right: Live Activity Feed */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="flex flex-col rounded-xl border border-border/40 bg-card/30 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Live Activity
              </span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground/50">
                {events.length} events
              </span>
            </div>

            <div
              ref={feedRef}
              className="flex-1 overflow-y-auto px-3 py-2 min-h-[140px] max-h-[240px]"
            >
              <AnimatePresence initial={false}>
                {recentEvents.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/40 py-8">
                    Waiting for events...
                  </div>
                ) : (
                  recentEvents.map((event) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      transition={{ duration: 0.25 }}
                      className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0"
                    >
                      {/* Agent color dot */}
                      <span
                        className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            AGENT_COLORS[event.agent as AgentType] || "#78716C",
                        }}
                      />
                      {/* Timestamp */}
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40 shrink-0 mt-0.5">
                        {new Date(event.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      {/* Action text */}
                      <span className="text-[11px] text-muted-foreground leading-snug truncate">
                        <span
                          className="font-medium"
                          style={{
                            color:
                              AGENT_COLORS[event.agent as AgentType] ||
                              "var(--muted-foreground)",
                          }}
                        >
                          {AGENT_LABELS[event.agent as AgentType] || event.agent}
                        </span>
                        {" "}
                        {formatEventAction(event)}
                      </span>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* ── 4. Tidbit Banner ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/10 px-4 py-2.5"
        >
          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-sky-500/60" />
          <div className="min-h-[1.25rem] flex items-center flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.p
                key={tidbitIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="text-[11px] leading-relaxed text-muted-foreground"
              >
                {tidbits[tidbitIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
