import { NextRequest, NextResponse } from "next/server";
import { generateGraphData, generateNeighborhoodGraph } from "@/lib/graph";
import { getErrorMessage } from "@/lib/utils/errors";
import { getDemoGraphData } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const cluster = request.nextUrl.searchParams.get("cluster") || undefined;
  const headword = request.nextUrl.searchParams.get("headword") || undefined;
  const language_code = request.nextUrl.searchParams.get("language_code") || undefined;
  const maxNodesParam = request.nextUrl.searchParams.get("max_nodes");
  const maxNodes = maxNodesParam ? Math.min(Math.max(parseInt(maxNodesParam, 10) || 400, 50), 1500) : undefined;

  try {
    const data = headword
      ? await generateNeighborhoodGraph(headword, 2, 50, language_code)
      : await generateGraphData(cluster, language_code, maxNodes);

    return NextResponse.json(data);
  } catch (err) {
    console.warn("[/api/graph] Elastic unavailable, using demo data:", getErrorMessage(err));
    return NextResponse.json(getDemoGraphData(cluster, headword));
  }
}
