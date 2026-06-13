import type { GraphEdgeType } from "@/lib/api";

export const CLUSTER_COLORS: Record<string, string> = {
  maritime: "#2563EB",
  agriculture: "#16A34A",
  kinship: "#2563EB",
  "daily-life": "#7C3AED",
  greetings: "#CA8A04",
  household: "#DB2777",
  nature: "#0D9488",
};

const FALLBACK_PALETTE = [
  "#BE185D",
  "#0891B2",
  "#65A30D",
  "#E11D48",
  "#9333EA",
];

export function clusterColor(cluster: string): string {
  if (CLUSTER_COLORS[cluster]) return CLUSTER_COLORS[cluster];
  let hash = 0;
  for (let i = 0; i < cluster.length; i++) {
    hash = cluster.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

export function nodeRadius(d: { sourceCount?: number; degree?: number }): number {
  return 10 + Math.sqrt(d.sourceCount || 1) * 4;
}

export const EDGE_TYPE_STYLES: Record<
  GraphEdgeType,
  { dash: number[] | null; opacity: number; color: string; label: string }
> = {
  related_term: { dash: null, opacity: 0.5, color: "#78716C", label: "Related term" },
  cluster: { dash: [5, 5], opacity: 0.2, color: "#D6CFC5", label: "Cluster" },
  embedding: { dash: [2, 3], opacity: 0.35, color: "#2563EB", label: "Embedding" },
};
