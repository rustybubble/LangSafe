/**
 * LangSafe — Poke Notification Integration
 * Sends iMessage/SMS notifications via Poke's inbound webhook API
 * for linguist alerts on new discoveries and pipeline milestones.
 */

import { getErrorMessage } from "../../lib/utils/errors.js";

const POKE_API_KEY = process.env.POKE_API_KEY || "";
const POKE_BASE_URL =
  process.env.POKE_BASE_URL || "https://api.pokemcp.com";

// ---------------------------------------------------------------------------
// Core sender
// ---------------------------------------------------------------------------

async function sendPokeNotification(message: string): Promise<boolean> {
  if (!POKE_API_KEY) {
    console.log("[Poke] POKE_API_KEY not set, skipping notification");
    return false;
  }

  try {
    const res = await fetch(`${POKE_BASE_URL}/v1/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${POKE_API_KEY}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      console.error(
        `[Poke] Notification failed (${res.status}): ${await res.text()}`
      );
      return false;
    }

    console.log(`[Poke] Notification sent: ${message.substring(0, 80)}...`);
    return true;
  } catch (err) {
    console.error(`[Poke] Error: ${getErrorMessage(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export async function notifyNewSourceDiscovered(
  title: string,
  url: string,
  vocabCount: number
): Promise<void> {
  const msg = [
    `🌊 LangSafe: New source discovered!`,
    `📖 ${title}`,
    `🔗 ${url}`,
    `📝 ${vocabCount} vocabulary entries extracted`,
  ].join("\n");

  await sendPokeNotification(msg);
}

export async function notifyDailyDigest(
  totalEntries: number,
  newToday: number,
  coveragePercent: number
): Promise<void> {
  const msg = [
    `📊 LangSafe Daily Digest`,
    `Total entries: ${totalEntries}`,
    `New today: ${newToday}`,
    `Coverage: ${coveragePercent.toFixed(1)}%`,
  ].join("\n");

  await sendPokeNotification(msg);
}

export async function notifyPipelineComplete(
  sources: number,
  entries: number,
  durationSec: number
): Promise<void> {
  const msg = [
    `✅ LangSafe Pipeline Complete`,
    `Sources processed: ${sources}`,
    `Entries preserved: ${entries}`,
    `Duration: ${durationSec.toFixed(0)}s`,
  ].join("\n");

  await sendPokeNotification(msg);
}
