"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Pause, Play, RotateCcw, Wifi, WifiOff, Zap, History, Search, X, Trash2, ChevronDown, Plus, Link, Square, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AGENT_COLORS, AGENT_LABELS, AgentType } from "@/lib/types";
import type { LanguageMetadata } from "@/lib/types";
import { useAgentEventsContext, MAX_EVENTS } from "@/lib/websocket";
import { PreservationDialog } from "@/components/search/PreservationDialog";
import { AgentEventCard } from "./agent-event-card";
import { CounterBar } from "./counter-bar";
import { useBrowserSessions } from "./use-browser-sessions";
import { BrowserSessionPanel } from "./browser-session-panel";
import { cn } from "@/lib/utils";

export function AgentFeed() {
  const {
    events,
    isConnected,
    connectionStatus,
    stats,
    isMock,
    pipelineStatus,
    stopPipeline,
    startPipeline,
    restartSimulation,
    clearEvents,
    injectSource,
  } = useAgentEventsContext();

  const [isPaused, setIsPaused] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [inProgressCollapsed, setInProgressCollapsed] = useState(false);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [showInject, setShowInject] = useState(false);
  const [preserveDialogOpen, setPreserveDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const injectInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { sessions, selectedUrl, selectSession, removeSession } =
    useBrowserSessions(events);

  const [frozenEvents, setFrozenEvents] = useState(events);
  const displayEvents = isPaused ? frozenEvents : events;

  useEffect(() => {
    if (isPaused) {
      setFrozenEvents(events);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, isPaused]);

  const handleRestart = () => {
    clearEvents();
    restartSimulation();
    setIsPaused(false);
  };

  const activeAgents = new Set<AgentType>();
  displayEvents.forEach((e) => {
    if (e.status === "running") activeAgents.add(e.agent);
  });

  const pipelineRunning = pipelineStatus === "running" || pipelineStatus === "cancelling";

  useEffect(() => {
    if (!pipelineRunning) setShowInject(false);
  }, [pipelineRunning]);

  const activeEvents = useMemo(
    () => pipelineRunning ? displayEvents.filter((e) => e.status === "running") : [],
    [displayEvents, pipelineRunning]
  );
  const completedEvents = useMemo(() => {
    const base = pipelineRunning
      ? displayEvents.filter((e) => e.status !== "running")
      : displayEvents;
    if (!logSearch.trim()) return base;
    const q = logSearch.toLowerCase();
    return base.filter((e) => {
      const agentLabel = AGENT_LABELS[e.agent]?.toLowerCase() ?? e.agent;
      const action = e.action.replace(/_/g, " ").toLowerCase();
      const message = (e.data.message || e.data.title || "").toLowerCase();
      return agentLabel.includes(q) || action.includes(q) || message.includes(q);
    });
  }, [displayEvents, pipelineRunning, logSearch]);

  const statusLabel =
    connectionStatus === "connected"
      ? "live"
      : connectionStatus === "polling"
        ? "polling"
        : connectionStatus === "reconnecting"
          ? "retrying"
          : connectionStatus === "mock"
            ? "demo"
            : connectionStatus;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--sidebar)" }}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-sidebar-border px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <Radio className="h-3.5 w-3.5 text-primary" />
            {!isPaused && activeAgents.size > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse-dot" />
            )}
          </div>
          <h2 className="font-serif text-sm tracking-tight">
            Agent Activity
          </h2>
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-0 px-1.5 py-0 text-[10px]"
            style={{
              backgroundColor: isConnected ? "#04785710" : "#0A84FF10",
              color: isConnected ? "#047857" : "#0A84FF",
            }}
          >
            {isConnected ? (
              <Wifi className="h-2.5 w-2.5" />
            ) : (
              <WifiOff className="h-2.5 w-2.5" />
            )}
            {statusLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Agent activity dots */}
          <div className="flex items-center gap-1 mr-1.5">
            {(
              ["discovery", "extraction", "cross_reference", "orchestrator"] as AgentType[]
            ).map((agent) => (
              <div
                key={agent}
                className={`h-1.5 w-1.5 rounded-full transition-opacity duration-300 ${
                  activeAgents.has(agent) ? "animate-pulse-dot" : "opacity-15"
                }`}
                style={{ backgroundColor: AGENT_COLORS[agent] }}
                title={agent}
              />
            ))}
          </div>

          {isMock && pipelineStatus !== "running" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleRestart}
              title="Restart simulation"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}

          {!pipelineRunning && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary/70 hover:text-primary hover:bg-primary/10"
              onClick={() => setPreserveDialogOpen(true)}
              title="Run preservation"
            >
              <Zap className="h-3 w-3" />
            </Button>
          )}

          {pipelineRunning && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6 transition-colors", showInject ? "text-primary/70 bg-primary/8" : "text-muted-foreground hover:text-foreground")}
              onClick={() => {
                setShowInject((s) => {
                  if (!s) setTimeout(() => injectInputRef.current?.focus(), 0);
                  return !s;
                });
              }}
              title="Add source URL"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}

          {pipelineRunning && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6",
                pipelineStatus === "cancelling"
                  ? "text-destructive/50"
                  : "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
              )}
              onClick={stopPipeline}
              disabled={pipelineStatus === "cancelling"}
              title={pipelineStatus === "cancelling" ? "Stopping..." : "Stop pipeline"}
            >
              {pipelineStatus === "cancelling" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Square className="h-3 w-3" />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setIsPaused((p) => !p)}
            title={isPaused ? "Resume feed" : "Pause feed"}
          >
            {isPaused ? (
              <Play className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Compact counters */}
      <CounterBar stats={stats} />

      {/* Inject source URL input */}
      <AnimatePresence>
        {showInject && pipelineRunning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden border-b border-sidebar-border"
          >
            <div className="relative px-4 py-1.5">
              <Link className="absolute left-[1.625rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground/30 pointer-events-none" />
              <input
                ref={injectInputRef}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    injectSource(e.currentTarget.value.trim());
                    e.currentTarget.value = "";
                    setShowInject(false);
                  }
                  if (e.key === "Escape") setShowInject(false);
                }}
                placeholder="Paste a source URL to add to the pipeline..."
                className="w-full h-6 rounded-sm border border-sidebar-border bg-sidebar-accent/40 pl-6 pr-2 font-mono text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 focus:bg-sidebar-accent/60 transition-colors"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Browserbase sessions */}
      <AnimatePresence>
        {sessions.size > 0 && (
          <BrowserSessionPanel
            sessions={sessions}
            selectedUrl={selectedUrl}
            onSelect={selectSession}
            onRemove={removeSession}
          />
        )}
      </AnimatePresence>

      {/* Scrollable feed — In Progress + Completed flow together */}
      <ScrollArea className="flex-1 min-h-0">
        {/* In Progress */}
        <div className={cn(
          "flex flex-col border-b",
          activeEvents.length > 0 ? "border-primary/10 animate-shimmer-border bg-[#FBF6EE]" : "border-sidebar-border"
        )}>
          <button
            type="button"
            onClick={() => setInProgressCollapsed((c) => !c)}
            className="flex w-full items-center gap-1.5 px-4 py-1.5 hover:bg-primary/5 transition-colors"
          >
            <Zap className={cn("h-2.5 w-2.5", activeEvents.length > 0 ? "text-primary/70" : "text-muted-foreground/40")} />
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", activeEvents.length > 0 ? "text-primary/70" : "text-muted-foreground/40")}>
              In Progress
            </span>
            <Badge variant="secondary" className={cn("px-1 py-0 font-mono text-[9px]", activeEvents.length > 0 ? "bg-primary/8 text-primary" : "bg-sidebar-accent text-muted-foreground")}>
              {activeEvents.length}
            </Badge>
            <ChevronDown
              className={cn(
                "ml-auto h-3 w-3 transition-transform duration-200",
                activeEvents.length > 0 ? "text-primary/40" : "text-muted-foreground/30",
                inProgressCollapsed && "-rotate-90"
              )}
            />
          </button>
          {!inProgressCollapsed && activeEvents.length > 0 && (
            <div className="flex flex-col pb-1">
              {activeEvents.map((event) => (
                <AgentEventCard key={event.id} event={event} isActive />
              ))}
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="flex flex-col border-t border-sidebar-border">
          <button
            type="button"
            onClick={() => setLogCollapsed((c) => !c)}
            className="flex w-full items-center gap-1.5 px-4 py-1.5 hover:bg-primary/5 transition-colors"
          >
            <History className="h-2.5 w-2.5 text-muted-foreground/40" />
            <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground/40 select-none">
              Completed
            </span>
            <Badge variant="secondary" className="px-1 py-0 font-mono text-[9px] bg-sidebar-accent text-muted-foreground">
              {completedEvents.length}{events.length >= MAX_EVENTS && "+"}
            </Badge>

            {/* Search match indicator */}
            <AnimatePresence>
              {logSearch.trim() && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="font-mono text-[9px] text-primary/60"
                >
                  {completedEvents.length} match{completedEvents.length !== 1 && "es"}
                </motion.span>
              )}
            </AnimatePresence>

            <div className="ml-auto flex items-center" onClick={(e) => e.stopPropagation()}>
              <span
                role="button"
                onClick={() => {
                  setShowSearch((s) => {
                    if (!s) setTimeout(() => searchInputRef.current?.focus(), 0);
                    else setLogSearch("");
                    return !s;
                  });
                }}
                title="Search logs"
                className={`inline-flex items-center justify-center h-5 w-5 rounded-sm transition-colors ${
                  showSearch
                    ? "text-primary/70 bg-primary/8"
                    : "text-muted-foreground/40 hover:text-muted-foreground/70"
                }`}
              >
                <Search className="h-2.5 w-2.5" />
              </span>
              <span
                role="button"
                onClick={() => {
                  clearEvents();
                  setLogSearch("");
                  setShowSearch(false);
                }}
                title="Clear logs"
                className={cn(
                  "inline-flex items-center justify-center h-5 w-5 rounded-sm text-muted-foreground/40 hover:text-red-500/70 transition-colors",
                  displayEvents.length === 0 && "opacity-30 pointer-events-none"
                )}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </span>
            </div>

            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground/30 transition-transform duration-200",
                logCollapsed && "-rotate-90"
              )}
            />
          </button>

          {/* Search input row */}
          <AnimatePresence>
            {showSearch && !logCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="relative px-4 pb-1.5">
                  <Search className="absolute left-[1.625rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground/30 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setLogSearch("");
                        setShowSearch(false);
                      }
                    }}
                    placeholder="Filter by agent, action, or message..."
                    className="w-full h-6 rounded-sm border border-sidebar-border bg-sidebar-accent/40 pl-6 pr-6 font-mono text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 outline-none focus:border-primary/30 focus:bg-sidebar-accent/60 transition-colors"
                  />
                  {logSearch && (
                    <button
                      onClick={() => {
                        setLogSearch("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-[1.375rem] top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Completed log entries */}
          {!logCollapsed && (
            <div className="flex flex-col pb-1">
              {completedEvents.map((event) => (
                <AgentEventCard key={event.id} event={event} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>

      <PreservationDialog
        open={preserveDialogOpen}
        onOpenChange={setPreserveDialogOpen}
        onStart={(lang) => {
          setPreserveDialogOpen(false);
          startPipeline({
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
          } satisfies LanguageMetadata);
        }}
      />
    </div>
  );
}
