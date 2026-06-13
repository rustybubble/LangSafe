import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { scrollAll, bulkIndex } from "../lib/elastic";
import type { VocabularyEntry } from "../lib/types";

const BACKUP_DIR = join(process.cwd(), "backups");

interface BackupEnvelope {
  exported_at: string;
  total: number;
  entries: VocabularyEntry[];
}

async function backup() {
  console.log(`\n📦 LangSafe — Elastic Backup\n`);

  console.log(`📡 Fetching all entries from Elasticsearch...`);
  const entries = await scrollAll();
  console.log(`   Found ${entries.length} entries`);

  if (entries.length === 0) {
    console.warn(`⚠️  No entries found — nothing to back up`);
    process.exit(0);
  }

  const envelope: BackupEnvelope = {
    exported_at: new Date().toISOString(),
    total: entries.length,
    entries,
  };

  const json = JSON.stringify(envelope, null, 2);
  const dateSlug = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `LangSafe-backup-${dateSlug}.json`;

  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const filepath = join(BACKUP_DIR, filename);
  writeFileSync(filepath, json, "utf-8");

  const sizeMB = (Buffer.byteLength(json, "utf-8") / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Backup saved`);
  console.log(`   File: ${filepath}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Entries: ${entries.length}`);

  // Copy to latest.json for easy reference
  const latestPath = join(BACKUP_DIR, "latest.json");
  copyFileSync(filepath, latestPath);
  console.log(`   Latest: ${latestPath}`);
}

async function restore(filepath: string) {
  console.log(`\n♻️  LangSafe — Elastic Restore\n`);

  if (!existsSync(filepath)) {
    console.error(`❌ File not found: ${filepath}`);
    process.exit(1);
  }

  console.log(`📂 Reading backup from ${filepath}...`);
  const raw = readFileSync(filepath, "utf-8");
  const envelope: BackupEnvelope = JSON.parse(raw);

  console.log(`   Backup date: ${envelope.exported_at}`);
  console.log(`   Entries: ${envelope.total}`);

  if (!envelope.entries || envelope.entries.length === 0) {
    console.warn(`⚠️  Backup file contains no entries`);
    process.exit(0);
  }

  console.log(`\n📡 Indexing ${envelope.entries.length} entries to Elasticsearch...`);
  const langCode = (envelope.entries[0] as unknown as { language_code?: string }).language_code || "jje";
  const result = await bulkIndex(envelope.entries, langCode);
  console.log(`\n✅ Restore complete`);
  console.log(`   Indexed: ${result.indexed}/${envelope.entries.length}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--restore") {
    const file = args[1];
    if (!file) {
      console.error(`❌ Usage: tsx scripts/backup-elastic.ts --restore <file>`);
      process.exit(1);
    }
    await restore(file);
  } else {
    await backup();
  }
}

main().catch((err) => {
  console.error(`\n❌ Failed:`, err);
  process.exit(1);
});
