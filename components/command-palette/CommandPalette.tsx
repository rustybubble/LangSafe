"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  BookOpen,
  Lightbulb,
  LayoutDashboard,
  Search,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  fetchLanguages,
  searchArchive,
  searchGrammarPatterns,
} from "@/lib/api";
import type {
  LanguageEntry,
  VocabularyEntry,
  GrammarPattern,
} from "@/lib/types";
import { ENDANGERMENT_COLORS, ENDANGERMENT_LABELS } from "@/lib/types";

// ── Component ───────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const [languages, setLanguages] = useState<LanguageEntry[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [grammar, setGrammar] = useState<GrammarPattern[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const router = useRouter();

  // ── Keyboard shortcut ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Search on debounced query ──────────────────────────────────────────

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setLanguages([]);
      setVocabulary([]);
      setGrammar([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    Promise.all([
      fetchLanguages({ search: trimmed, limit: 5 }),
      searchArchive(trimmed, { limit: 5 }),
      searchGrammarPatterns(trimmed, { limit: 5 }),
    ])
      .then(([langRes, vocabRes, grammarRes]) => {
        if (cancelled) return;
        setLanguages(langRes.languages);
        setVocabulary(vocabRes.results);
        setGrammar(grammarRes.patterns);
      })
      .catch(() => {
        // API functions have internal fallbacks
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        setQuery("");
        setLanguages([]);
        setVocabulary([]);
        setGrammar([]);
      }, 150);
    }
  }, []);

  const navigateTo = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  const hasResults =
    languages.length > 0 || vocabulary.length > 0 || grammar.length > 0;
  const showNavigation = !debouncedQuery.trim() && !isSearching;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search languages, vocabulary, grammar..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading skeletons */}
        {isSearching && (
          <div className="px-4 py-4 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        )}

        {/* Empty state */}
        {!isSearching && debouncedQuery.trim() && !hasResults && (
          <CommandEmpty>
            No results found for &ldquo;{debouncedQuery}&rdquo;
          </CommandEmpty>
        )}

        {/* Navigation shortcuts (when query is empty) */}
        {showNavigation && (
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => navigateTo("/dashboard")}>
              <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => navigateTo("/languages")}>
              <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
              Browse Languages
            </CommandItem>
          </CommandGroup>
        )}

        {/* Languages */}
        {languages.length > 0 && !isSearching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Languages">
              {languages.map((lang) => {
                const color = ENDANGERMENT_COLORS[lang.endangerment_status];
                return (
                  <CommandItem
                    key={lang.glottocode}
                    value={`lang-${lang.name}-${lang.glottocode}`}
                    onSelect={() =>
                      navigateTo(`/languages/${lang.glottocode}`)
                    }
                  >
                    <Globe className="mr-2 h-4 w-4 shrink-0 text-primary/70" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate font-medium">{lang.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {lang.language_family} &middot; {lang.macroarea}
                        {lang.speaker_count != null &&
                          lang.speaker_count > 0 &&
                          ` · ~${lang.speaker_count.toLocaleString()} speakers`}
                      </span>
                    </div>
                    <span
                      className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{
                        backgroundColor: `${color}18`,
                        color: color,
                      }}
                    >
                      {ENDANGERMENT_LABELS[lang.endangerment_status]}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Vocabulary */}
        {vocabulary.length > 0 && !isSearching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Vocabulary">
              {vocabulary.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={`vocab-${entry.headword_native}-${entry.id}`}
                  onSelect={() => setOpen(false)}
                >
                  <BookOpen className="mr-2 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">
                      <span className="font-medium">
                        {entry.headword_native}
                      </span>
                      {entry.headword_romanized && (
                        <span className="ml-1.5 text-muted-foreground">
                          ({entry.headword_romanized})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {entry.pos}
                      {entry.definitions?.[0]?.text &&
                        ` — ${entry.definitions[0].text}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Grammar Patterns */}
        {grammar.length > 0 && !isSearching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Grammar Patterns">
              {grammar.map((pattern) => (
                <CommandItem
                  key={pattern.id}
                  value={`grammar-${pattern.title}-${pattern.id}`}
                  onSelect={() => setOpen(false)}
                >
                  <Lightbulb className="mr-2 h-4 w-4 shrink-0 text-sky-600" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {pattern.title}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {pattern.category.replace(/_/g, " ")} &middot;{" "}
                      {pattern.description.length > 80
                        ? `${pattern.description.slice(0, 80)}...`
                        : pattern.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer hints */}
      <div className="border-t border-border/60 px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">
              ↑↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">
              ↵
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">
              esc
            </kbd>
            close
          </span>
        </div>
        <Search className="h-3 w-3" />
      </div>
    </CommandDialog>
  );
}
