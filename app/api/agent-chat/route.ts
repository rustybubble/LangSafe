import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api-response";

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const AGENT_ID = "LangSafe-linguist";

export async function POST(request: NextRequest) {
  if (!KIBANA_URL || !KIBANA_API_KEY) {
    return apiError("Agent Builder not configured (missing KIBANA_URL or KIBANA_API_KEY)", 503);
  }

  try {
    const { message, conversation_id } = (await request.json()) as {
      message?: string;
      conversation_id?: string;
    };

    if (!message?.trim()) {
      return apiError("Message is required", 400);
    }

    const res = await fetch(`${KIBANA_URL}/api/agent_builder/converse/async`, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${KIBANA_API_KEY}`,
        "kbn-xsrf": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        input: message,
        ...(conversation_id ? { conversation_id } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[agent-chat] Kibana error ${res.status}: ${body}`);
      return apiError("Agent Builder request failed", 502);
    }

    if (!res.body) {
      return apiError("No response stream from Agent Builder", 502);
    }

    // Pipe through a TransformStream to prevent Next.js from buffering
    const decoder = new TextDecoder();
    const { readable, writable } = new TransformStream();
    const reader = res.body.getReader();

    (async () => {
      const writer = writable.getWriter();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Log each SSE chunk for debugging
          const text = decoder.decode(value, { stream: true });
          const eventTypes = [...text.matchAll(/^event:\s*(.+)$/gm)].map(m => m[1]);
          if (eventTypes.length > 0) {
            console.log(`[agent-chat] SSE events: ${eventTypes.join(", ")}`);
          }
          await writer.write(value);
        }
      } catch {
        // stream interrupted
      } finally {
        console.log("[agent-chat] Stream ended");
        writer.close();
      }
    })();

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[agent-chat] Error:", (err as Error).message);
    return apiError("Internal server error", 500);
  }
}
