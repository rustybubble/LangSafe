"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, Geometry } from "geojson";
import type L from "leaflet";
import type { CountryLanguageStats, EndangermentStatus } from "@/lib/types";
import { ENDANGERMENT_COLORS, ENDANGERMENT_LABELS } from "@/lib/types";
import { getChoroplethColor } from "@/lib/map-utils";

// ── Props ───────────────────────────────────────────────────────────────────

interface ChoroplethLayerProps {
  countryStats: Map<string, CountryLanguageStats>;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface CountryProperties {
  ISO_A2: string;
  NAME: string;
}

type CountryFeature = Feature<Geometry, CountryProperties>;

// GeoJSON FeatureCollection type
interface CountryFeatureCollection {
  type: "FeatureCollection";
  features: CountryFeature[];
}

// ── Component ───────────────────────────────────────────────────────────────

export function ChoroplethLayer({ countryStats }: ChoroplethLayerProps) {
  const [geojson, setGeojson] = useState<CountryFeatureCollection | null>(null);

  // Load country boundaries once
  useEffect(() => {
    fetch("/data/countries-110m.geojson")
      .then((res) => res.json())
      .then((data: CountryFeatureCollection) => setGeojson(data))
      .catch(console.error);
  }, []);

  // Style each country based on language count
  const style = useCallback(
    (feature?: CountryFeature) => {
      if (!feature) return {};
      const code = feature.properties.ISO_A2;
      const stats = countryStats.get(code);
      const count = stats?.total_languages ?? 0;
      return {
        fillColor: getChoroplethColor(count),
        fillOpacity: count > 0 ? 0.7 : 0.15,
        color: "#4a5568",
        weight: 0.5,
        opacity: 0.6,
      };
    },
    [countryStats]
  );

  // Bind popup + hover effects
  const onEachFeature = useCallback(
    (feature: CountryFeature, layer: L.Layer) => {
      const code = feature.properties.ISO_A2;
      const name = feature.properties.NAME;
      const stats = countryStats.get(code);
      const count = stats?.total_languages ?? 0;

      // Build endangerment breakdown
      let breakdownHtml = "";
      if (stats && count > 0) {
        const entries = Object.entries(stats.by_endangerment) as [
          EndangermentStatus,
          number,
        ][];
        if (entries.length > 0) {
          breakdownHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px">`;
          for (const [status, n] of entries.sort(([, a], [, b]) => b - a)) {
            const color = ENDANGERMENT_COLORS[status];
            const label = ENDANGERMENT_LABELS[status];
            breakdownHtml += `
              <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#667085">
                <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
                ${label}: ${n}
              </div>`;
          }
          breakdownHtml += `</div>`;
        }
      }

      layer.bindPopup(
        `<div style="min-width:160px;font-family:var(--font-plus-jakarta),sans-serif">
          <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:4px;font-family:var(--font-dm-serif),serif">
            ${name}
          </div>
          <div style="font-size:12px;color:#667085">
            ${count} endangered language${count !== 1 ? "s" : ""}
          </div>
          ${breakdownHtml}
        </div>`
      );

      // Hover highlight
      const pathLayer = layer as L.Path;
      layer.on({
        mouseover: () => {
          pathLayer.setStyle({ weight: 2, opacity: 1, fillOpacity: 0.85 });
        },
        mouseout: () => {
          pathLayer.setStyle({
            weight: 0.5,
            opacity: 0.6,
            fillOpacity: count > 0 ? 0.7 : 0.15,
          });
        },
      });
    },
    [countryStats]
  );

  // Force remount when stats change — react-leaflet GeoJSON doesn't re-apply style
  const key = useMemo(() => {
    let hash = 0;
    countryStats.forEach((v) => {
      hash += v.total_languages;
    });
    return `choropleth-${countryStats.size}-${hash}`;
  }, [countryStats]);

  if (!geojson) return null;

  return (
    <GeoJSON
      key={key}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={geojson as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={style as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature={onEachFeature as any}
    />
  );
}
