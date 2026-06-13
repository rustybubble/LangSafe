"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Flag,
  GraduationCap,
  Loader2,
  Mic2,
  MessageSquareQuote,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_GRAMMAR_PATTERNS, searchDemoVocabulary } from "@/lib/demo-data";
import type { VocabularyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReviewStatus = "pending" | "verified" | "needs_elder" | "flagged";
type Role = "speaker" | "teacher" | "linguist";
type LessonTheme = "maritime" | "kinship" | "agriculture";
type Audience = "family" | "classroom" | "fieldwork";

type LessonPack = {
  provider: "featherless" | "demo";
  model: string;
  title: string;
  summary: string;
  activities: string[];
  oralPrompt?: string;
  quickCheck?: string;
};

const ROLE_OPTIONS: { value: Role; label: string; icon: typeof UsersRound }[] = [
  { value: "speaker", label: "Speaker", icon: Mic2 },
  { value: "teacher", label: "Teacher", icon: GraduationCap },
  { value: "linguist", label: "Linguist", icon: ClipboardList },
];

const THEME_OPTIONS: { value: LessonTheme; label: string }[] = [
  { value: "maritime", label: "Maritime" },
  { value: "kinship", label: "Kinship" },
  { value: "agriculture", label: "Agriculture" },
];

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "family", label: "Family" },
  { value: "classroom", label: "Classroom" },
  { value: "fieldwork", label: "Field Kit" },
];

const STATUS_META: Record<
  ReviewStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#667085", bg: "#EEF2F7" },
  verified: { label: "Verified", color: "#047857", bg: "#DFF4EA" },
  needs_elder: { label: "Needs Elder", color: "#4F46E5", bg: "#EEF2FF" },
  flagged: { label: "Flagged", color: "#D92D20", bg: "#FEE4E2" },
};

function makeInitialQueue() {
  const { entries } = searchDemoVocabulary("", { limit: 6, language_code: "jje" });
  return entries.map((entry, index) => ({
    entry,
    status: "pending" as ReviewStatus,
    note:
      index % 2 === 0
        ? "Matches source definitions; needs speaker nuance for classroom examples."
        : "Good candidate for oral-history prompt and pronunciation review.",
  }));
}

function definition(entry: VocabularyEntry) {
  return entry.definitions.find((item) => item.language === "en")?.text ?? "";
}

export default function RevitalizationStudioPage() {
  const [role, setRole] = useState<Role>("speaker");
  const [queue, setQueue] = useState(makeInitialQueue);
  const [theme, setTheme] = useState<LessonTheme>("maritime");
  const [audience, setAudience] = useState<Audience>("classroom");
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [includeOralPrompt, setIncludeOralPrompt] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lessonGenerated, setLessonGenerated] = useState(true);
  const [lesson, setLesson] = useState<LessonPack | null>(null);

  const reviewedCount = queue.filter((item) => item.status !== "pending").length;
  const verifiedCount = queue.filter((item) => item.status === "verified").length;
  const needsReviewCount = queue.filter(
    (item) => item.status === "needs_elder" || item.status === "flagged"
  ).length;

  const lessonWords = useMemo(() => {
    const { entries } = searchDemoVocabulary("", {
      language_code: "jje",
      cluster: theme,
      limit: 5,
    });
    return entries;
  }, [theme]);

  const grammarPattern = useMemo(
    () =>
      DEMO_GRAMMAR_PATTERNS.find((pattern) =>
        pattern.related_vocabulary.some((term) =>
          lessonWords.some((entry) => entry.headword_native === term)
        )
      ) ?? DEMO_GRAMMAR_PATTERNS[0],
    [lessonWords]
  );

  const localLesson = useMemo<LessonPack>(() => {
    const themeLabel = THEME_OPTIONS.find((option) => option.value === theme)?.label ?? "Archive";
    const audienceLabel =
      AUDIENCE_OPTIONS.find((option) => option.value === audience)?.label ?? "Community";
    const first = lessonWords[0]?.headword_native ?? "the first archive term";
    const second = lessonWords[1]?.headword_native;

    return {
      provider: "demo",
      model: "Bundled Jejueo fallback",
      title: `${themeLabel} Starter Pack`,
      summary: `${audienceLabel} format built from ${lessonWords.length} archive terms, with provenance preserved for community review.`,
      activities: [
        `Open with the meaning, pronunciation, and source notes for ${first}.`,
        `Compare two related terms and mark dialect, consent, or classroom-use notes.`,
        `Practice the archive pattern: ${grammarPattern.title.toLowerCase()}.`,
      ],
      oralPrompt: `Ask an elder to tell a memory involving ${first}${
        second ? ` or ${second}` : ""
      }, then mark any words that need consent, dialect notes, or restricted access.`,
      quickCheck:
        "Match each Jejueo word to its English meaning, then use one word in a sentence with the connective pattern from the archive.",
    };
  }, [audience, grammarPattern.title, lessonWords, theme]);

  const displayedLesson = lesson ?? localLesson;

  const updateReview = (id: string, status: ReviewStatus) => {
    setQueue((current) =>
      current.map((item) =>
        item.entry.id === id
          ? {
              ...item,
              status,
              note:
                status === "verified"
                  ? `${ROLE_OPTIONS.find((option) => option.value === role)?.label} verification added to the archive.`
                  : item.note,
            }
          : item
      )
    );
  };

  const resetQueue = () => {
    setQueue(makeInitialQueue());
  };

  const generateLesson = async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/featherless/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          audience,
          includeQuiz,
          includeOralPrompt,
          vocabulary: lessonWords.map((entry) => ({
            term: entry.headword_native,
            romanized: entry.headword_romanized,
            definition: definition(entry),
            cluster: entry.semantic_cluster,
            sources: entry.cross_references.length,
          })),
          grammarPattern: {
            title: grammarPattern.title,
            description: grammarPattern.description,
          },
        }),
      });

      const payload = (await response.json()) as {
        lesson?: LessonPack;
        error?: string;
      };

      if (!response.ok || !payload.lesson) {
        throw new Error(payload.error ?? "Lesson generation failed");
      }

      setLesson(payload.lesson);
      setLessonGenerated(true);
    } catch (error) {
      console.error("[studio] Lesson generation failed:", error);
      setLesson(localLesson);
      setLessonGenerated(true);
      setGenerationError(
        "Featherless generation is unavailable, so LangSafe kept the demo moving with a local lesson pack."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/40 bg-background/80 px-5 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h1 className="font-serif text-[17px] tracking-tight text-foreground">
                Revitalization Studio
              </h1>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                LingHacks VII
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Turn extracted archive data into community-reviewed learning material.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric value={`${reviewedCount}/${queue.length}`} label="reviewed" />
            <Metric value={String(verifiedCount)} label="verified" />
            <Metric value={String(needsReviewCount)} label="follow-ups" />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <h2 className="font-serif text-lg tracking-tight">
                  Community Review Queue
                </h2>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1">
                {ROLE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                      role === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/50 bg-card/70">
              {queue.map(({ entry, status, note }) => {
                const statusMeta = STATUS_META[status];
                return (
                  <div
                    key={entry.id}
                    className="grid gap-3 border-b border-border/30 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-serif text-2xl tracking-tight" dir="auto">
                          {entry.headword_native}
                        </h3>
                        {entry.headword_romanized && (
                          <span className="text-sm italic text-muted-foreground">
                            {entry.headword_romanized}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className="border-0 px-1.5 py-0 text-[10px]"
                          style={{
                            color: statusMeta.color,
                            backgroundColor: statusMeta.bg,
                          }}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                        {definition(entry)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{entry.cross_references.length} sources</span>
                        {entry.semantic_cluster && <span>{entry.semantic_cluster}</span>}
                        <span className="truncate">{note}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 self-center">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Verify entry"
                        onClick={() => updateReview(entry.id, "verified")}
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Request elder note"
                        onClick={() => updateReview(entry.id, "needs_elder")}
                      >
                        <MessageSquareQuote className="h-4 w-4 text-indigo-600" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Flag for review"
                        onClick={() => updateReview(entry.id, "flagged")}
                      >
                        <Flag className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={resetQueue}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset queue
              </Button>
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-blue-700" />
              <h2 className="font-serif text-lg tracking-tight">
                Lesson Pack Builder
              </h2>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/70 p-4">
              <ControlGroup label="Theme">
                {THEME_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    active={theme === option.value}
                    onClick={() => {
                      setTheme(option.value);
                      setLesson(null);
                      setGenerationError(null);
                    }}
                  >
                    {option.label}
                  </Chip>
                ))}
              </ControlGroup>

              <ControlGroup label="Audience">
                {AUDIENCE_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    active={audience === option.value}
                    onClick={() => {
                      setAudience(option.value);
                      setLesson(null);
                      setGenerationError(null);
                    }}
                  >
                    {option.label}
                  </Chip>
                ))}
              </ControlGroup>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeQuiz}
                    onChange={(event) => {
                      setIncludeQuiz(event.target.checked);
                      setLesson(null);
                      setGenerationError(null);
                    }}
                    className="accent-primary"
                  />
                  Quick check
                </label>
                <label className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeOralPrompt}
                    onChange={(event) => {
                      setIncludeOralPrompt(event.target.checked);
                      setLesson(null);
                      setGenerationError(null);
                    }}
                    className="accent-primary"
                  />
                  Oral prompt
                </label>
              </div>

              <Button
                className="mt-4 w-full"
                onClick={generateLesson}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? "Generating with Featherless" : "Generate lesson pack"}
              </Button>

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Uses Featherless.ai when configured, with a local fallback for live demos.
              </p>
            </div>

            {lessonGenerated && (
              <div className="mt-4 rounded-lg border border-border/50 bg-card/80 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl tracking-tight">
                      {displayedLesson.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {displayedLesson.summary}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      displayedLesson.provider === "featherless"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {displayedLesson.provider === "featherless"
                      ? "Featherless.ai"
                      : "Demo fallback"}
                  </Badge>
                </div>

                <div className="mb-4 rounded-md border border-primary/15 bg-primary/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Generation model
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {displayedLesson.model}
                  </p>
                </div>

                {generationError && (
                  <div className="mb-4 rounded-md border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
                    {generationError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Vocabulary
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {lessonWords.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-md border border-border/40 bg-background/50 px-3 py-2"
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="font-serif text-lg">
                              {entry.headword_native}
                            </span>
                            <span className="text-xs italic text-muted-foreground">
                              {entry.headword_romanized}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {definition(entry)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-blue-700/15 bg-blue-700/5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-800">
                      Grammar focus
                    </p>
                    <p className="mt-1 text-sm text-foreground/85">
                      {grammarPattern.title}: {grammarPattern.description}
                    </p>
                  </div>

                  <div className="rounded-md border border-sky-600/15 bg-sky-600/5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800">
                      Lesson flow
                    </p>
                    <ol className="mt-2 space-y-1.5">
                      {displayedLesson.activities.map((activity, index) => (
                        <li key={activity} className="flex gap-2 text-sm text-foreground/85">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 font-mono text-[10px] text-sky-700">
                            {index + 1}
                          </span>
                          <span>{activity}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {includeOralPrompt && displayedLesson.oralPrompt && (
                    <div className="rounded-md border border-indigo-600/15 bg-indigo-600/5 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                        Oral-history prompt
                      </p>
                      <p className="mt-1 text-sm text-foreground/85">
                        {displayedLesson.oralPrompt}
                      </p>
                    </div>
                  )}

                  {includeQuiz && displayedLesson.quickCheck && (
                    <div className="rounded-md border border-emerald-700/15 bg-emerald-700/5 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                        Quick check
                      </p>
                      <p className="mt-1 text-sm text-foreground/85">
                        {displayedLesson.quickCheck}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-20 rounded-md border border-border/40 bg-card/60 px-3 py-1.5">
      <div className="font-serif text-lg leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
        {label}
      </div>
    </div>
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-secondary"
      )}
    >
      {children}
    </button>
  );
}
