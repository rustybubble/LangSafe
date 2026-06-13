import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/errors";
import type { PipelineRunArtifact } from "@/lib/types";
import { getDemoPipelineRuns } from "@/lib/demo-data";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ languageCode: string }> }
) {
  const { languageCode } = await params;

  if (!CLOUDFLARE_WORKER_URL) {
    return NextResponse.json(getDemoPipelineRuns(languageCode));
  }

  try {
    // 1. List run keys from Worker
    const listRes = await fetch(
      `${CLOUDFLARE_WORKER_URL}/runs/${encodeURIComponent(languageCode)}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!listRes.ok) {
      return NextResponse.json([] as PipelineRunArtifact[]);
    }

    const list: { key: string; uploaded: string; size: number }[] =
      await listRes.json();

    if (list.length === 0) {
      return NextResponse.json([] as PipelineRunArtifact[]);
    }

    // 2. Fetch actual JSON for each run (limit to 10 most recent)
    const recent = list.slice(0, 10);
    const artifacts = await Promise.all(
      recent.map(async (item) => {
        try {
          const res = await fetch(
            `${CLOUDFLARE_WORKER_URL}/${item.key}`,
            { signal: AbortSignal.timeout(10_000) }
          );
          if (!res.ok) return null;
          return (await res.json()) as PipelineRunArtifact;
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json(
      artifacts.filter((a): a is PipelineRunArtifact => a !== null)
    );
  } catch (err) {
    console.warn("[API] Pipeline runs fetch failed:", getErrorMessage(err));
    return NextResponse.json(getDemoPipelineRuns(languageCode));
  }
}
