"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchBar } from "./search-bar";
import { SearchResults } from "@/components/results/SearchResults";
import { VocabularyDetail } from "@/components/results/VocabularyDetail";
import { GrammarPatternCard } from "@/components/grammar/GrammarPatternCard";
import { GrammarPatternDetail } from "@/components/grammar/GrammarPatternDetail";
import { KnowledgeGraph } from "@/components/graph/KnowledgeGraph";
import { LanguageHealth } from "@/components/dashboard/LanguageHealth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { searchArchive, searchGrammarPatterns, fetchGrammarStats } from "@/lib/api";
import { VocabularyEntry, LanguageEntry, GrammarPattern, GrammarCategory, VocabSortOption, GrammarSortOption } from "@/lib/types";
import { ArchiveFilters } from "./ArchiveFilters";
import { useAgentEventsContext } from "@/lib/websocket";
import { ArchiveBuilding } from "./ArchiveBuilding";
import { DistinctiveVocabulary } from "@/components/insights/DistinctiveVocabulary";
import { SourcesList } from "./SourcesList";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/utils/errors";
import { Languages, BookOpen, Network, Activity, Layers, Loader2, BookText, MessageSquare, ExternalLink, LayoutDashboard } from "lucide-react";
import { AgentChat } from "@/components/featherless-chat/AgentChat";
import Link from "next/link";

const PAGE_SIZE = 20;

interface SearchPanelProps {
  language?: LanguageEntry;
  showHealthTab?: boolean;
  embedded?: boolean;
  onNavigateToDashboard?: () => void;
}

export function SearchPanel({ language, showHealthTab = true, embedded = false, onNavigateToDashboard }: SearchPanelProps) {
  const { pipelineStatus, stats } = useAgentEventsContext();

  // ── Shared state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("archive");
  const [resultMode, setResultMode] = useState<"vocabulary" | "grammar">("vocabulary");
  const languageCode = language?.iso_code;

  // ── Vocabulary state ──────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<VocabularyEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [activePOS, setActivePOS] = useState<string | null>(null);
  const [vocabSort, setVocabSort] = useState<VocabSortOption>("relevance");
  const [hasAudioOnly, setHasAudioOnly] = useState(false);
  const [minSources, setMinSources] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<VocabularyEntry | null>(null);
  const lastVocabCountRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // ── Grammar state ─────────────────────────────────────────────────────
  const [grammarQuery, setGrammarQuery] = useState("");
  const [grammarPatterns, setGrammarPatterns] = useState<GrammarPattern[]>([]);
  const [grammarTotal, setGrammarTotal] = useState(0);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarCategory, setGrammarCategory] = useState<GrammarCategory | null>(null);
  const [grammarStats, setGrammarStats] = useState<Record<string, number>>({});
  const [grammarHasLoaded, setGrammarHasLoaded] = useState(false);
  const [activeConfidence, setActiveConfidence] = useState<string | null>(null);
  const [grammarSort, setGrammarSort] = useState<GrammarSortOption>("relevance");
  const [hasExamplesOnly, setHasExamplesOnly] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<GrammarPattern | null>(null);
  const grammarDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Vocabulary handlers ───────────────────────────────────────────────

  const handleVocabSearch = useCallback(async (searchQuery: string) => {
    setActiveTab("archive");
    setResultMode("vocabulary");
    setQuery(searchQuery);
    setError(undefined);
    setOffset(0);
    setActiveCluster(null);
    setIsLoading(true);
    setHasSearched(!!searchQuery);

    try {
      const { results: data, total } = await searchArchive(searchQuery, {
        limit: PAGE_SIZE,
        offset: 0,
        language_code: languageCode,
      });
      setResults(data);
      setTotalCount(total);
      setHasMore(data.length < total);
    } catch (err) {
      setError(`Search failed: ${getErrorMessage(err)}`);
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [languageCode]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;

    try {
      const { results: newResults, total } = await searchArchive(query, {
        limit: PAGE_SIZE,
        offset: newOffset,
        language_code: languageCode,
      });

      setResults((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const unique = newResults.filter((e) => !seen.has(e.id));
        return [...prev, ...unique];
      });
      setOffset(newOffset);
      setTotalCount(total);
      setHasMore(newOffset + newResults.length < total);
    } catch (err) {
      console.error("Load more failed:", err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [query, offset, hasMore, languageCode]);

  const handleCardClick = useCallback((entry: VocabularyEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleRelatedTermClick = useCallback(
    (term: string) => {
      setSelectedEntry(null);
      handleVocabSearch(term);
    },
    [handleVocabSearch]
  );

  // ── Grammar handlers ──────────────────────────────────────────────────

  const doGrammarSearch = useCallback(
    async (searchQuery: string, category?: GrammarCategory | null) => {
      setGrammarLoading(true);
      try {
        const { patterns, total } = await searchGrammarPatterns(searchQuery, {
          category: category || undefined,
          limit: 50,
        });
        setGrammarPatterns(patterns);
        setGrammarTotal(total);
        setGrammarHasLoaded(true);
      } catch (err) {
        console.error("[Grammar] Search failed:", err);
        setGrammarPatterns([]);
        setGrammarTotal(0);
      } finally {
        setGrammarLoading(false);
      }
    },
    []
  );

  const handleGrammarSearch = useCallback(
    (searchQuery: string) => {
      setActiveTab("archive");
      setResultMode("grammar");
      setGrammarQuery(searchQuery);
      if (grammarDebounceRef.current) clearTimeout(grammarDebounceRef.current);
      grammarDebounceRef.current = setTimeout(() => {
        doGrammarSearch(searchQuery.trim(), grammarCategory);
      }, 300);
    },
    [doGrammarSearch, grammarCategory]
  );

  // ── Unified search dispatcher ─────────────────────────────────────────

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (resultMode === "grammar") {
        handleGrammarSearch(searchQuery);
      } else {
        handleVocabSearch(searchQuery);
      }
    },
    [resultMode, handleVocabSearch, handleGrammarSearch]
  );

  // ── Load data on mount ────────────────────────────────────────────────

  useEffect(() => {
    searchArchive("", { limit: PAGE_SIZE, offset: 0, language_code: languageCode }).then(
      ({ results: data, total }) => {
        if (data.length > 0) {
          setResults(data);
          setTotalCount(total);
          setHasMore(data.length < total);
        }
      }
    );
  }, [languageCode]);

  // Load grammar on mount
  useEffect(() => {
    doGrammarSearch("", null);
  }, [doGrammarSearch]);

  // Fetch grammar stats
  useEffect(() => {
    fetchGrammarStats().then(({ by_category }) => setGrammarStats(by_category));
  }, []);

  // Re-search grammar when category changes
  useEffect(() => {
    doGrammarSearch(grammarQuery.trim(), grammarCategory);
  }, [grammarCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => {
      if (grammarDebounceRef.current) clearTimeout(grammarDebounceRef.current);
    };
  }, []);

  // ── Auto-refresh during pipeline ─────────────────────────────────────

  useEffect(() => {
    if (pipelineStatus !== "running" && pipelineStatus !== "complete") return;

    const prevCount = lastVocabCountRef.current;
    const currentCount = stats.vocabulary;
    lastVocabCountRef.current = currentCount;

    if (currentCount <= prevCount && pipelineStatus !== "complete") return;

    const timer = setTimeout(() => {
      const searchQuery = query.trim();
      // Fetch all currently loaded pages so we don't reset pagination
      const currentLoaded = offset + PAGE_SIZE;
      searchArchive(searchQuery || "", { limit: currentLoaded, offset: 0, language_code: languageCode }).then(
        ({ results: data, total }) => {
          setResults(data);
          setTotalCount(total);
          // Preserve current offset — don't reset pagination
          setHasMore(currentLoaded < total);
          if (!searchQuery) setHasSearched(false);
        }
      );
    }, pipelineStatus === "complete" ? 500 : 3000);

    return () => clearTimeout(timer);
  }, [stats.vocabulary, pipelineStatus, query, languageCode, offset]);

  // ── Derived data ──────────────────────────────────────────────────────

  const clusterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((r) => {
      if (r.semantic_cluster) {
        counts[r.semantic_cluster] = (counts[r.semantic_cluster] || 0) + 1;
      }
    });
    return counts;
  }, [results]);

  const posCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((r) => {
      if (r.pos) counts[r.pos] = (counts[r.pos] || 0) + 1;
    });
    return counts;
  }, [results]);

  const filteredResults = useMemo(() => {
    let filtered = results;
    if (activeCluster) filtered = filtered.filter((r) => r.semantic_cluster === activeCluster);
    if (activePOS) filtered = filtered.filter((r) => r.pos === activePOS);
    if (hasAudioOnly) filtered = filtered.filter((r) => !!r.audio_url);
    if (minSources > 0) filtered = filtered.filter((r) => (r.cross_references?.length || 0) >= minSources);
    if (vocabSort === "alphabetical") {
      filtered = [...filtered].sort((a, b) => a.headword_native.localeCompare(b.headword_native));
    } else if (vocabSort === "sources") {
      filtered = [...filtered].sort((a, b) => (b.cross_references?.length || 0) - (a.cross_references?.length || 0));
    }
    return filtered;
  }, [results, activeCluster, activePOS, hasAudioOnly, minSources, vocabSort]);

  const hasVocabFilters = !!(activeCluster || activePOS || hasAudioOnly || minSources > 0 || vocabSort !== "relevance");

  const filteredGrammar = useMemo(() => {
    let filtered = grammarPatterns;
    if (activeConfidence) filtered = filtered.filter((p) => p.confidence === activeConfidence);
    if (hasExamplesOnly) filtered = filtered.filter((p) => p.examples.length > 0);
    if (grammarSort === "newest") {
      filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (grammarSort === "examples") {
      filtered = [...filtered].sort((a, b) => b.examples.length - a.examples.length);
    }
    return filtered;
  }, [grammarPatterns, activeConfidence, hasExamplesOnly, grammarSort]);

  const hasGrammarFilters = !!(activeConfidence || hasExamplesOnly || grammarSort !== "relevance");

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "flex flex-col" : "flex h-full flex-col"}>
      {/* Header */}
      <div className="shrink-0 border-b border-border/60 px-5 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-sm tracking-tight">
              {language ? `${language.name} Archive` : "Language Archive"}
            </h2>
            {language && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-secondary/70">
                <Languages className="mr-1 h-2.5 w-2.5 text-muted-foreground" />
                {language.iso_code}
              </Badge>
            )}
          </div>
          {language && (
            embedded && onNavigateToDashboard ? (
              <button
                onClick={onNavigateToDashboard}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <LayoutDashboard className="h-3 w-3" />
                Go to Dashboard
              </button>
            ) : !embedded ? (
              <Link
                href={`/languages/${language.glottocode}`}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View page
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null
          )}
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={cn("flex flex-1 flex-col", !embedded && "min-h-0")}
      >
        <div className="px-5 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="archive" className="flex-1 gap-1.5 text-xs">
              <BookOpen className="h-3 w-3" />
              Archive
            </TabsTrigger>
            <TabsTrigger value="graph" className="flex-1 gap-1.5 text-xs">
              <Network className="h-3 w-3" />
              Graph
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex-1 gap-1.5 text-xs">
              <Layers className="h-3 w-3" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="ask" className="flex-1 gap-1.5 text-xs">
              <MessageSquare className="h-3 w-3" />
              Ask
            </TabsTrigger>
            {showHealthTab && (
              <TabsTrigger value="health" className="flex-1 gap-1.5 text-xs">
                <Activity className="h-3 w-3" />
                Health
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Archive tab (vocabulary + grammar) */}
        <TabsContent
          value="archive"
          className="flex flex-1 flex-col min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <div className="px-5 py-3">
            <SearchBar
              onSearch={handleSearch}
              isLoading={resultMode === "vocabulary" ? isLoading : grammarLoading}
              resultCount={
                resultMode === "vocabulary"
                  ? hasSearched ? results.length : undefined
                  : grammarHasLoaded && grammarQuery ? grammarPatterns.length : undefined
              }
              language={language}
              placeholder={
                resultMode === "grammar"
                  ? language
                    ? `Search ${language.name} grammar patterns...`
                    : "Search grammar patterns..."
                  : language
                    ? `Search ${language.name} vocabulary...`
                    : undefined
              }
            />

            {/* Vocabulary / Grammar toggle + filters */}
            <div className="mt-2.5">
              <ArchiveFilters
                mode={resultMode}
                onModeChange={setResultMode}
                vocab={{
                  clusters: clusterCounts,
                  activeCluster,
                  onClusterChange: setActiveCluster,
                  posCounts,
                  activePOS,
                  onPOSChange: setActivePOS,
                  sort: vocabSort,
                  onSortChange: setVocabSort,
                  hasAudioOnly,
                  onHasAudioChange: setHasAudioOnly,
                  minSources,
                  onMinSourcesChange: setMinSources,
                }}
                grammar={{
                  grammarStats,
                  activeCategory: grammarCategory,
                  onCategoryChange: setGrammarCategory,
                  activeConfidence,
                  onConfidenceChange: setActiveConfidence,
                  sort: grammarSort,
                  onSortChange: setGrammarSort,
                  hasExamplesOnly,
                  onHasExamplesChange: setHasExamplesOnly,
                }}
              />
            </div>
          </div>

          {/* Distinctive vocabulary insights (significant_terms) */}
          {resultMode === "vocabulary" && languageCode && (
            <div className="px-5 pb-2">
              <DistinctiveVocabulary
                languageCode={languageCode}
                onClusterClick={(cluster) => setActiveCluster(cluster || null)}
                activeCluster={activeCluster}
              />
            </div>
          )}

          {/* Pipeline building banner (vocabulary mode, has results) */}
          {resultMode === "vocabulary" && pipelineStatus === "running" && results.length > 0 && (
            <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>
                Archive building — {stats.vocabulary} entries indexed — results auto-refresh as vocabulary is indexed...
              </span>
            </div>
          )}

          {/* Vocabulary results */}
          {resultMode === "vocabulary" && (() => {
            if (pipelineStatus === "running" && results.length === 0 && !hasSearched) {
              return <ArchiveBuilding language={language} stats={stats} />;
            }
            const vocabContent = (
              <div className="px-5 pb-4">
                <SearchResults
                  results={filteredResults}
                  totalCount={hasVocabFilters ? filteredResults.length : totalCount}
                  hasMore={hasVocabFilters ? false : hasMore}
                  isLoading={isLoading}
                  isLoadingMore={isLoadingMore}
                  hasSearched={hasSearched}
                  query={query}
                  error={error}
                  onCardClick={handleCardClick}
                  onLoadMore={loadMore}
                  languageName={language?.name}
                />
              </div>
            );
            return embedded ? vocabContent : (
              <div className="flex-1 min-h-0 overflow-y-auto">{vocabContent}</div>
            );
          })()}

          {/* Grammar results */}
          {resultMode === "grammar" && (() => {
            const grammarContent = (
              <div className="px-5 pb-4">
                {grammarLoading ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="border-b border-border/40 py-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-4 w-16 rounded-full" />
                        </div>
                        <Skeleton className="mt-2 h-4 w-full" />
                        <Skeleton className="mt-1 h-4 w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : grammarPatterns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BookText className="mb-3 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {grammarHasLoaded
                        ? grammarQuery
                          ? `No grammar patterns found for "${grammarQuery}"`
                          : "No grammar patterns found. Run a preservation pipeline to extract grammar patterns from sources."
                        : "Loading grammar patterns..."}
                    </p>
                  </div>
                ) : filteredGrammar.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BookText className="mb-3 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No patterns match the current filters
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {filteredGrammar.length}
                      {hasGrammarFilters || grammarCategory
                        ? ` of ${grammarTotal}`
                        : grammarTotal > filteredGrammar.length
                          ? ` of ${grammarTotal}`
                          : ""
                      } pattern{filteredGrammar.length !== 1 ? "s" : ""}
                    </p>
                    <AnimatePresence mode="popLayout">
                      <motion.div
                        key={grammarQuery || "browse-grammar"}
                        initial="hidden"
                        animate="visible"
                        variants={{
                          hidden: {},
                          visible: { transition: { staggerChildren: 0.04 } },
                        }}
                      >
                        {filteredGrammar.map((pattern) => (
                          <GrammarPatternCard
                            key={pattern.id}
                            pattern={pattern}
                            onClick={setSelectedPattern}
                          />
                        ))}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </div>
            );
            return embedded ? grammarContent : (
              <ScrollArea className="flex-1 min-h-0">{grammarContent}</ScrollArea>
            );
          })()}
        </TabsContent>

        {/* Knowledge Graph tab */}
        <TabsContent
          value="graph"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <motion.div
            key="graph-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            <KnowledgeGraph onNodeDoubleClick={handleVocabSearch} languageCode={languageCode} />
          </motion.div>
        </TabsContent>

        {/* Sources tab */}
        <TabsContent
          value="sources"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <motion.div
            key="sources-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            <SourcesList languageCode={languageCode} />
          </motion.div>
        </TabsContent>

        {/* Ask tab */}
        <TabsContent
          value="ask"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
        >
          <motion.div
            key="ask-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            <AgentChat languageCode={languageCode} languageName={language?.name} />
          </motion.div>
        </TabsContent>

        {/* Health tab */}
        {showHealthTab && (
          <TabsContent
            value="health"
            className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
          >
            <motion.div
              key="health-tab"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <LanguageHealth language={language} />
            </motion.div>
          </TabsContent>
        )}
      </Tabs>

      {/* Vocabulary detail modal */}
      <VocabularyDetail
        entry={selectedEntry}
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
        onRelatedTermClick={handleRelatedTermClick}
        languageName={language?.name}
      />

      {/* Grammar detail modal */}
      <GrammarPatternDetail
        pattern={selectedPattern}
        open={!!selectedPattern}
        onOpenChange={(open) => {
          if (!open) setSelectedPattern(null);
        }}
        onVocabularyClick={(term) => {
          setSelectedPattern(null);
          handleVocabSearch(term);
        }}
      />
    </div>
  );
}
