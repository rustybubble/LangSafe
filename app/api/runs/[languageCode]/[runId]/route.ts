import { NextRequest } from "next/server";
import { apiError } from "@/lib/utils/api-response";
import { getErrorMessage } from "@/lib/utils/errors";
import type { PipelineRunArtifact } from "@/lib/types";
import { getDemoPipelineRuns } from "@/lib/demo-data";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ languageCode: string; runId: string }> }
) {
  const { languageCode, runId } = await params;

  if (!CLOUDFLARE_WORKER_URL) {
    const demoRun = getDemoPipelineRuns(languageCode).find((run) => run.id === runId);
    return demoRun ? Response.json(demoRun) : apiError("Run not found", 404);
  }

  try {
    const key = `runs/${languageCode}/${runId}.json`;
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/${key}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("Run not found", 404);
    }

    const artifact: PipelineRunArtifact = await res.json();
    return Response.json(artifact);
  } catch (err) {
    const demoRun = getDemoPipelineRuns(languageCode).find((run) => run.id === runId);
    if (demoRun) return Response.json(demoRun);
    return apiError(getErrorMessage(err));
  }
}
