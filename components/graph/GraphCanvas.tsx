"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import dynamic from "next/dynamic";
import * as d3 from "d3";
import { clusterColor, nodeRadius, EDGE_TYPE_STYLES } from "./graph-constants";
import type { SimNode, SimLink, GraphSettings, ProcessedGraphData } from "./graph-types";

// Dynamic import to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export interface GraphCanvasHandle {
  zoomToFit: (duration?: number, padding?: number) => void;
  centerAt: (x: number, y: number, duration?: number) => void;
  zoom: (k: number, duration?: number) => void;
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };
}

interface GraphCanvasProps {
  data: ProcessedGraphData;
  settings: GraphSettings;
  highlightNodes: Set<string>;
  highlightLinks: Set<SimLink>;
  selectedNode: SimNode | null;
  hoveredNode: SimNode | null;
  pinnedNodes: Set<string>;
  pathHighlight: string[];
  searchMatch: string | null;
  onNodeClick: (node: SimNode) => void;
  onNodeHover: (node: SimNode | null) => void;
  onNodeRightClick: (node: SimNode, event: MouseEvent) => void;
  onBackgroundClick: () => void;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(
    {
      data,
      settings,
      highlightNodes,
      highlightLinks,
      selectedNode,
      hoveredNode,
      pinnedNodes,
      pathHighlight,
      searchMatch,
      onNodeClick,
      onNodeHover,
      onNodeRightClick,
      onBackgroundClick,
    },
    ref
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasActiveHighlight = highlightNodes.size > 0;
    const pathSet = new Set(pathHighlight);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      zoomToFit: (duration = 400, padding = 50) => {
        fgRef.current?.zoomToFit(duration, padding);
      },
      centerAt: (x: number, y: number, duration = 400) => {
        fgRef.current?.centerAt(x, y, duration);
      },
      zoom: (k: number, duration = 400) => {
        fgRef.current?.zoom(k, duration);
      },
      graph2ScreenCoords: (x: number, y: number) => {
        return fgRef.current?.graph2ScreenCoords(x, y) || { x: 0, y: 0 };
      },
    }));

    // Resize observer
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height });
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    // Configure forces when settings change
    useEffect(() => {
      if (!fgRef.current) return;
      const fg = fgRef.current;
      fg.d3Force("link")?.distance(settings.linkDistance);
      fg.d3Force("charge")?.strength(settings.chargeStrength);
      fg.d3Force(
        "collision",
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4)
      );
      fg.d3ReheatSimulation();
    }, [settings.linkDistance, settings.chargeStrength]);

    // Zoom to fit on first load
    const handleEngineStop = useCallback(() => {
      fgRef.current?.zoomToFit(600, 50);
    }, []);

    // Custom node painting
    const paintNode = useCallback(
      (node: SimNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (node.x == null || node.y == null) return;
        const r = nodeRadius(node);
        const color = clusterColor(node.cluster);
        const isHighlighted = !hasActiveHighlight || highlightNodes.has(node.id);
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isPathNode = pathSet.has(node.id);
        const isSearchMatch =
          searchMatch != null &&
          (node.headword.toLowerCase().includes(searchMatch.toLowerCase()) ||
            (node.romanization?.toLowerCase().includes(searchMatch.toLowerCase()) ?? false));

        ctx.save();
        ctx.globalAlpha = isHighlighted ? 1 : 0.12;

        // Glow — subtle on light background
        if (isSelected || isHovered || isPathNode || isSearchMatch) {
          ctx.shadowColor = isPathNode ? "#2563EB" : color;
          ctx.shadowBlur = isSelected ? 12 : isHovered ? 8 : 6;
        } else {
          ctx.shadowColor = color + "80";
          ctx.shadowBlur = 2 + Math.min(node.degree || 0, 10) * 0.3;
        }

        // Radial gradient — solid color with soft edge for light bg
        const gradient = ctx.createRadialGradient(
          node.x - r * 0.3,
          node.y - r * 0.3,
          0,
          node.x,
          node.y,
          r
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.7, color);
        gradient.addColorStop(1, color + "40");

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Selection / path ring
        if (isSelected || isPathNode) {
          ctx.strokeStyle = isPathNode ? "#2563EB" : "#1C1917";
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }

        // Search match ring
        if (isSearchMatch && !isSelected) {
          ctx.strokeStyle = "#2563EB";
          ctx.lineWidth = 1.5 / globalScale;
          ctx.setLineDash([3 / globalScale, 2 / globalScale]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Pin indicator
        if (pinnedNodes.has(node.id)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y - r - 3 / globalScale, 2 / globalScale, 0, 2 * Math.PI);
          ctx.fillStyle = "#2563EB";
          ctx.shadowBlur = 0;
          ctx.fill();
        }

        // Label — dark text for light background
        if (settings.showLabels && globalScale > 0.4) {
          const fontSize = Math.max(14 / globalScale, 4);
          ctx.font = `600 ${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#1C1917";
          ctx.shadowColor = "rgba(255,255,255,0.7)";
          ctx.shadowBlur = 3;
          ctx.fillText(node.headword, node.x, node.y + r + 4 / globalScale);
        }

        ctx.restore();
      },
      [hasActiveHighlight, highlightNodes, selectedNode, hoveredNode, pinnedNodes, pathSet, searchMatch, settings.showLabels]
    );

    // Pointer area for hit detection
    const paintPointerArea = useCallback(
      (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
        if (node.x == null || node.y == null) return;
        const r = nodeRadius(node) + 4;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      },
      []
    );

    // Custom link rendering
    const linkColor = useCallback(
      (link: SimLink) => {
        const style = EDGE_TYPE_STYLES[link.type] || EDGE_TYPE_STYLES.related_term;
        if (highlightLinks.has(link)) return style.color;
        if (hasActiveHighlight) return style.color + "20";
        return style.color;
      },
      [highlightLinks, hasActiveHighlight]
    );

    const linkWidth = useCallback(
      (link: SimLink) => {
        if (highlightLinks.has(link)) return 1 + link.weight * 3;
        return 0.5 + link.weight * 1.5;
      },
      [highlightLinks]
    );

    const linkLineDash = useCallback(
      (link: SimLink) => {
        if (!settings.showEdgeTypes) return undefined;
        return EDGE_TYPE_STYLES[link.type]?.dash ?? undefined;
      },
      [settings.showEdgeTypes]
    );

    const linkCurvature = settings.curvedEdges ? 0.15 : 0;

    // Handle double-click via timer
    const handleNodeClickInternal = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any) => {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          return; // double-click handled by onNodeClick's timeout
        }
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onNodeClick(node as SimNode);
        }, 250);
      },
      [onNodeClick]
    );

    // Background paint for gradient
    const onRenderFramePre = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        const { width, height } = ctx.canvas;
        ctx.fillStyle = "#F5F7FB";
        ctx.fillRect(0, 0, width, height);
      },
      []
    );

    // Node drag end — handle pinning
    const handleNodeDragEnd = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node: any) => {
        if (pinnedNodes.has(node.id)) {
          node.fx = node.x;
          node.fy = node.y;
        } else {
          node.fx = undefined;
          node.fy = undefined;
        }
      },
      [pinnedNodes]
    );

    // Cast callbacks to any to satisfy react-force-graph-2d's strict generics.
    // Our SimNode/SimLink types are supersets of the library's NodeObject/LinkObject
    // so this is safe at runtime.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (
      <div ref={containerRef} className="h-full w-full bg-background">
        {typeof window !== "undefined" && (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={data as any}
            nodeId="id"
            nodeCanvasObject={paintNode as any}
            nodeCanvasObjectMode={() => "replace"}
            nodePointerAreaPaint={paintPointerArea as any}
            linkSource="source"
            linkTarget="target"
            linkColor={linkColor as any}
            linkWidth={linkWidth as any}
            linkLineDash={linkLineDash as any}
            linkCurvature={linkCurvature}
            linkDirectionalParticles={((link: SimLink) =>
              highlightLinks.has(link) ? 3 : 0) as any}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            d3AlphaDecay={0.02}
            warmupTicks={60}
            cooldownTicks={100}
            onEngineStop={handleEngineStop}
            onNodeClick={handleNodeClickInternal as any}
            onNodeHover={((node: SimNode | null) => onNodeHover(node)) as any}
            onNodeRightClick={((node: SimNode, event: MouseEvent) =>
              onNodeRightClick(node, event)) as any}
            onNodeDragEnd={handleNodeDragEnd as any}
            onBackgroundClick={onBackgroundClick}
            onRenderFramePre={onRenderFramePre as any}
            enableNodeDrag={true}
            minZoom={0.3}
            maxZoom={4}
          />
        )}
      </div>
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
);
