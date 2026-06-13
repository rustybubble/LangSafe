import { getErrorMessage } from "../../lib/utils/errors.js";
import { emitEvent } from "../utils/event-emitter.js";
import {
  runDiscoveryAgent as runAgent,
  type DiscoverySource,
  type DiscoveryResult,
} from "../../lib/agents/discovery-agent.js";
import type { DiscoveredSource, LanguageMetadata } from "../types.js";

export interface DiscoveryStats {
  serp_api_searches: number;
  featherless_searches: number;
  web_unlocker_scrapes: number;
}

export async function runDiscoveryAgent(
  meta: LanguageMetadata,
  onSource?: (source: DiscoveredSource) => void,
  signal?: AbortSignal
): Promise<{ sources: DiscoveredSource[]; stats: DiscoveryStats }> {
  const scanEvent = emitEvent("discovery", "scanning_source", "running", {
    message: `Starting AI-driven discovery for ${meta.language_name} (${meta.language_code})...`,
  });

  const onSourceFound = (source: DiscoverySource): void => {
    emitEvent("discovery", "found_source", "complete", {
      url: source.url,
      title: source.title,
      type: source.type,
      discovered_via: source.discovered_via,
    });

    // Forward to pipeline's streaming callback
    onSource?.({
      url: source.url,
      title: source.title,
      type: source.type,
      description: source.description,
      discovered_via: source.discovered_via,
    });
  };

  try {
    const result = await runAgent(meta, onSourceFound, signal);

    const bdSuffix = result.serp_api_searches > 0
      ? ` (SERP API: ${result.serp_api_searches} geo-targeted searches, Web Unlocker: ${result.web_unlocker_scrapes} scrapes)`
      : "";

    emitEvent("discovery", "scanning_source", "complete", {
      message: `Discovery complete. Found ${result.total_reported} sources across ${result.total_searches} searches${bdSuffix}.`,
      count: result.total_reported,
    }, scanEvent.id);

    return {
      sources: result.sources.map((s) => ({
        url: s.url,
        title: s.title,
        type: s.type,
        description: s.description,
        discovered_via: s.discovered_via,
      })),
      stats: {
        serp_api_searches: result.serp_api_searches,
        featherless_searches: result.featherless_searches,
        web_unlocker_scrapes: result.web_unlocker_scrapes,
      },
    };
  } catch (err) {
    emitEvent("discovery", "scanning_source", "error", {
      message: `Discovery agent failed: ${getErrorMessage(err)}`,
    }, scanEvent.id);
    return {
      sources: [],
      stats: { serp_api_searches: 0, featherless_searches: 0, web_unlocker_scrapes: 0 },
    };
  }
}
