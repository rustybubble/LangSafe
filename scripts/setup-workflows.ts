import { config } from "dotenv";
config({ path: ".env.local" });

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;

if (!KIBANA_URL || !KIBANA_API_KEY) {
  console.error("Missing KIBANA_URL or KIBANA_API_KEY in .env.local");
  process.exit(1);
}

const WORKFLOW_NAME = "LangSafe Data Quality Monitor";

const WORKFLOW_YAML = `name: ${WORKFLOW_NAME}
description: Data quality check for the LangSafe vocabulary archive — counts total entries, missing embeddings, and empty headwords, then saves a report to Elasticsearch.
enabled: true
triggers:
  - type: manual
steps:
  - name: count_total
    type: elasticsearch.search
    with:
      index: language_resources
      size: 0
      query:
        match_all: {}
  - name: count_missing_embeddings
    type: elasticsearch.search
    with:
      index: language_resources
      size: 0
      query:
        bool:
          must_not:
            - exists:
                field: embedding
  - name: count_empty_headwords
    type: elasticsearch.search
    with:
      index: language_resources
      size: 0
      query:
        term:
          headword_native.keyword: ""
  - name: save_report
    type: elasticsearch.request
    with:
      method: POST
      path: /data_quality_reports/_doc
      body:
        timestamp: "{{ execution.startedAt }}"
        total_entries: "{{ steps.count_total.output.hits.total.value }}"
        missing_embeddings: "{{ steps.count_missing_embeddings.output.hits.total.value }}"
        empty_headwords: "{{ steps.count_empty_headwords.output.hits.total.value }}"
`;

async function kibanaRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${KIBANA_URL}${path}`, {
    method,
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "x-elastic-internal-origin": "Kibana",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok && res.status !== 404) {
    throw new Error(`Kibana ${method} ${path} failed (${res.status}): ${text}`);
  }
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function main() {
  console.log("Setting up Elastic Workflows...\n");

  // Step 1: Ensure workflows UI is enabled
  console.log("Enabling workflows:ui:enabled setting...");
  await kibanaRequest(
    "POST",
    "/internal/kibana/settings/workflows:ui:enabled",
    { value: true }
  );
  console.log("Workflows UI enabled.\n");

  // Step 2: Create workflow
  console.log(`Creating workflow "${WORKFLOW_NAME}"...`);
  const { data: created } = await kibanaRequest("POST", "/api/workflows", {
    yaml: WORKFLOW_YAML,
  });

  if (created.valid) {
    console.log(`\n✅ Workflow created successfully`);
    console.log(`   ID: ${created.id}`);
    console.log(`   Name: ${created.name}`);
    console.log(`   Valid: ${created.valid}`);
    console.log(`   Enabled: ${created.enabled}`);
    console.log(`   Steps: ${created.definition?.steps?.length ?? "?"}`);
  } else {
    console.warn(`\n⚠️  Workflow created but marked as invalid`);
    console.warn(`   ID: ${created.id}`);
    console.warn(`   This may need manual review in Kibana UI`);
  }

  console.log("\nDone! Check Kibana → Workflows to see it.");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
