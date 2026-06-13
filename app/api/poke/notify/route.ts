import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/errors";
import { apiError } from "@/lib/utils/api-response";

const POKE_API_KEY = process.env.POKE_API_KEY || "";
const POKE_BASE_URL =
  process.env.POKE_BASE_URL || "https://api.pokemcp.com";

async function sendPokeNotification(message: string): Promise<boolean> {
  if (!POKE_API_KEY) {
    return false;
  }

  const res = await fetch(`${POKE_BASE_URL}/v1/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POKE_API_KEY}`,
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Poke API ${res.status}: ${body}`);
  }

  return true;
}

function buildMessage(body: Record<string, unknown>): string {
  const { type } = body;

  switch (type) {
    case "source_discovered":
      return [
        `🌊 LangSafe: New source discovered!`,
        `📖 ${body.title}`,
        `🔗 ${body.url}`,
        `📝 ${body.vocab_count} vocabulary entries extracted`,
      ].join("\n");

    case "pipeline_complete":
      return [
        `✅ LangSafe Pipeline Complete`,
        `Sources processed: ${body.sources}`,
        `Entries preserved: ${body.entries}`,
        `Duration: ${Number(body.duration_sec).toFixed(0)}s`,
      ].join("\n");

    case "daily_digest":
      return [
        `📊 LangSafe Daily Digest`,
        `Total entries: ${body.total_entries}`,
        `New today: ${body.new_today}`,
        `Coverage: ${Number(body.coverage_percent).toFixed(1)}%`,
      ].join("\n");

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  source_discovered: ["title", "url", "vocab_count"],
  pipeline_complete: ["sources", "entries", "duration_sec"],
  daily_digest: ["total_entries", "new_today", "coverage_percent"],
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { type } = body;
  if (!type || typeof type !== "string") {
    return apiError("Missing required field: type", 400);
  }

  const required = REQUIRED_FIELDS[type];
  if (!required) {
    return apiError(`Invalid type: ${type}. Must be one of: ${Object.keys(REQUIRED_FIELDS).join(", ")}`, 400);
  }

  const missing = required.filter((f) => body[f] == null);
  if (missing.length > 0) {
    return apiError(`Missing required fields for ${type}: ${missing.join(", ")}`, 400);
  }

  if (!POKE_API_KEY) {
    return NextResponse.json({ sent: false, reason: "POKE_API_KEY not set" });
  }

  try {
    const message = buildMessage(body);
    await sendPokeNotification(message);
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error(
      "[/api/poke/notify] Error:",
      getErrorMessage(err)
    );
    return apiError(getErrorMessage(err));
  }
}
