"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Unlock,
  Search,
  MapPin,
  Database,
  Globe,
  Timer,
  ExternalLink,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/agent-feed/counter-bar";
import { fetchBrightDataMetrics } from "@/lib/api";
import { useAgentEventsContext } from "@/lib/websocket";
import type { BrightDataMetrics } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BD_BLUE = "#0066FF";
const BD_BLUE_SOFT = "#0066FF26";
const FEATHERLESS_BLUE = "#2563EB";

// ---------------------------------------------------------------------------
// Attribution tooltip
// ---------------------------------------------------------------------------

function AttributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string; label: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs shadow-lg">
      <span style={{ color: item.payload.color }}>{item.payload.label}</span>
      <span className="ml-2 font-bold">{item.value} sources</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function BrightDataImpactSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-[72px] rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[60px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[80px] rounded-xl" />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BrightDataImpact() {
  const [metrics, setMetrics] = useState<BrightDataMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const { stats: liveStats, pipelineStatus } = useAgentEventsContext();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await fetchBrightDataMetrics();
      if (!cancelled) {
        setMetrics(data);
        setLoading(false);
      }
    };
    load();

    // Refresh after pipeline completes
    if (pipelineStatus === "complete") {
      const timer = setTimeout(load, 500);
      return () => { cancelled = true; clearTimeout(timer); };
    }

    return () => { cancelled = true; };
  }, [pipelineStatus]);

  if (loading) return <BrightDataImpactSkeleton />;

  // Merge persisted metrics with live deltas
  const unlocks = (metrics?.sources_unlocked ?? 0) + liveStats.brightdataUnlocks;
  const serpApiSearches = metrics?.searches_geo_targeted ?? 0;
  const scrapes = metrics?.scrapes_total ?? 0;
  const countriesSearched = metrics?.countries_searched ?? [];
  const avgWU = metrics?.avg_crawl_duration_web_unlocker_ms ?? 0;
  const unlockedUrls = metrics?.sources_unlocked_urls ?? [];
  const serpApiDiscoveries = (metrics?.sources_discovered_via_serp_api ?? 0) + liveStats.brightdataDiscoveries;
  const wuCrawls = (metrics?.sources_crawled_via_web_unlocker ?? 0) + liveStats.brightdataCrawls;
  const contentUnlocked = metrics?.content_unlocked_bytes ?? 0;
  const contentStandard = metrics?.content_standard_bytes ?? 0;

  // Don't render if no BrightData activity at all
  const hasActivity = unlocks > 0 || serpApiSearches > 0 || scrapes > 0 || serpApiDiscoveries > 0 || wuCrawls > 0;
  if (!hasActivity && pipelineStatus !== "running") return null;

  // Discovery attribution chart data
  const totalSources = serpApiDiscoveries + (liveStats.sources - serpApiDiscoveries);
  const chartData = [
    { label: "SERP API", value: serpApiDiscoveries, color: BD_BLUE },
    { label: "Featherless", value: Math.max(0, liveStats.sources - serpApiDiscoveries), color: FEATHERLESS_BLUE },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-3">
      <Separator className="opacity-50" />

      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex h-5 w-5 items-center justify-center rounded"
          style={{ backgroundColor: BD_BLUE_SOFT }}
        >
          <Database className="h-3 w-3" style={{ color: BD_BLUE }} />
        </div>
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          BrightData Impact
        </span>
      </div>

      {/* Hero stat: Sources Unlocked */}
      {unlocks > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="border-border/50 bg-card/80">
            <CardContent className="flex items-center gap-3 p-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: BD_BLUE_SOFT }}
              >
                <Unlock className="h-5 w-5" style={{ color: BD_BLUE }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1">
                  <AnimatedNumber value={unlocks} color={BD_BLUE} />
                  <span className="text-xs text-muted-foreground">
                    {unlocks === 1 ? "source" : "sources"} unlocked
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
                  Protected sources unlocked via Web Unlocker
                  {contentUnlocked > 0 && ` (${formatBytes(contentUnlocked)} of content)`}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Metric cards grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* SERP API Searches */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin className="h-3 w-3" style={{ color: BD_BLUE }} />
              <span className="text-[10px] text-muted-foreground">SERP API</span>
            </div>
            <AnimatedNumber value={serpApiSearches} color={BD_BLUE} />
          </CardContent>
        </Card>

        {/* Web Unlocker Pages */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Database className="h-3 w-3" style={{ color: BD_BLUE }} />
              <span className="text-[10px] text-muted-foreground">Web Unlocker</span>
            </div>
            <AnimatedNumber value={scrapes + wuCrawls} color={BD_BLUE} />
          </CardContent>
        </Card>

        {/* Countries Searched */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Globe className="h-3 w-3" style={{ color: "#047857" }} />
              <span className="text-[10px] text-muted-foreground">Countries</span>
            </div>
            {countriesSearched.length > 0 ? (
              <span className="text-sm font-bold" style={{ color: "#047857" }}>
                {countriesSearched.join(", ")}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        {/* Crawl Speed */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Timer className="h-3 w-3" style={{ color: FEATHERLESS_BLUE }} />
              <span className="text-[10px] text-muted-foreground">Avg Speed</span>
            </div>
            {avgWU > 0 ? (
              <span className="text-sm font-bold" style={{ color: FEATHERLESS_BLUE }}>
                {(avgWU / 1000).toFixed(1)}s
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content volume comparison */}
      {(contentUnlocked > 0 || contentStandard > 0) && (
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <p className="text-[10px] text-muted-foreground mb-1.5">Content Volume</p>
            <div className="space-y-1 text-[11px] font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Web Unlocker</span>
                <span className="font-bold" style={{ color: BD_BLUE }}>
                  {formatBytes(contentUnlocked)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Standard fetch</span>
                <span className="text-foreground/70">
                  {formatBytes(contentStandard)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discovery attribution bar chart */}
      {chartData.length > 0 && totalSources > 0 && (
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <p className="text-[10px] text-muted-foreground mb-2">Discovery Attribution</p>
            <ResponsiveContainer width="100%" height={32}>
              <BarChart
                data={[{ name: "sources", ...Object.fromEntries(chartData.map((d) => [d.label, d.value])) }]}
                layout="vertical"
                barSize={20}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide />
                {chartData.map((d) => (
                  <Bar
                    key={d.label}
                    dataKey={d.label}
                    stackId="a"
                    fill={d.color}
                    radius={d.label === chartData[0].label ? [4, 0, 0, 4] :
                            d.label === chartData[chartData.length - 1].label ? [0, 4, 4, 0] : 0}
                  />
                ))}
                <Tooltip content={<AttributionTooltip />} cursor={false} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1.5">
              {chartData.map((d) => (
                <div key={d.label} className="flex items-center gap-1">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {d.label} ({d.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unlocked Sources list */}
      {unlockedUrls.length > 0 && (
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-2.5">
            <p className="text-[10px] text-muted-foreground mb-1.5">
              Web Unlocker — Unlocked Sources
            </p>
            <ScrollArea className="max-h-[120px]">
              <div className="space-y-1">
                {unlockedUrls.map((u) => (
                  <div
                    key={u}
                    className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted/50"
                  >
                    <Unlock className="h-3 w-3 shrink-0 text-emerald-500" />
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[11px] text-foreground/80 hover:text-foreground hover:underline"
                    >
                      {u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
                    </a>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
