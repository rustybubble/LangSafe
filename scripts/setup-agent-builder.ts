import { config } from "dotenv";
config({ path: ".env.local" });

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;

if (!KIBANA_URL || !KIBANA_API_KEY) {
  console.error("Missing KIBANA_URL or KIBANA_API_KEY in .env.local");
  process.exit(1);
}

const AGENT_ID = "LangSafe-linguist";

const AGENT_INSTRUCTIONS = `You are LangSafe Linguist, an expert assistant for exploring and understanding endangered languages.

You have access to 3 Elasticsearch indices:

1. **language_resources** — Vocabulary archive with fields:
   - headword_native (word in the target language)
   - headword_romanized (romanized form)
   - definitions (array with text and language)
   - example_sentences (target, contact language, English)
   - pos (part of speech)
   - ipa (phonetic transcription)
   - conjugations (verb forms)
   - morphology, grammar_notes, cultural_context
   - semantic_cluster (topic grouping like "maritime", "food", "family")
   - related_terms, cross_references (sources)
   - language_code (ISO 639-3, e.g. "jje" for Jejueo)

2. **grammar_patterns** — Linguistic grammar rules with fields:
   - title, description, rule
   - category (verb_conjugation, particle_usage, honorific_system, etc.)
   - examples (array of pattern, translation, explanation)
   - related_vocabulary, differences_from_korean
   - confidence score

3. **languages** — 5,352 endangered languages from Glottolog with fields:
   - name, glottocode, iso_code
   - family (language family)
   - endangerment_level (2=threatened, 3=shifting, 4=moribund, 5=nearly_extinct, 6=extinct)
   - endangerment_status (human-readable)
   - location (geo_point with lat/lon)
   - country, macroarea
   - alternate_names
   - speakers_count (when available)

Guidelines:
- When asked about vocabulary, search the language_resources index
- When asked about grammar rules or conjugation, search grammar_patterns
- When asked about endangered languages worldwide, search the languages index
- Provide culturally sensitive, accurate responses
- Include phonetic transcriptions (IPA) when available
- Cite source information from cross_references when relevant
- If asked about a specific language, filter by language_code or glottocode
- You can use ES|QL or the search tool — choose whichever is more appropriate for the query`;

async function kibanaRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(`${KIBANA_URL}${path}`, {
    method,
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Kibana ${method} ${path} failed (${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("Setting up LangSafe Agent Builder...\n");

  // Check if agent already exists
  const { results: agents } = await kibanaRequest("GET", "/api/agent_builder/agents");
  const existing = agents.find((a: { id: string }) => a.id === AGENT_ID);

  if (existing) {
    console.log(`Agent "${AGENT_ID}" already exists. Updating...`);
    await kibanaRequest("PUT", `/api/agent_builder/agents/${AGENT_ID}`, {
      name: "LangSafe Linguist",
      description: "Expert assistant for exploring endangered language vocabulary, grammar, and global language endangerment data",
      configuration: {
        instructions: AGENT_INSTRUCTIONS,
        tools: [
          {
            tool_ids: [
              "platform.core.search",
              "platform.core.generate_esql",
              "platform.core.execute_esql",
              "platform.core.list_indices",
              "platform.core.get_index_mapping",
              "platform.core.get_document_by_id",
            ],
          },
        ],
      },
    });
    console.log("Agent updated.\n");
  } else {
    console.log(`Creating agent "${AGENT_ID}"...`);
    await kibanaRequest("POST", "/api/agent_builder/agents", {
      id: AGENT_ID,
      name: "LangSafe Linguist",
      description: "Expert assistant for exploring endangered language vocabulary, grammar, and global language endangerment data",
      configuration: {
        instructions: AGENT_INSTRUCTIONS,
        tools: [
          {
            tool_ids: [
              "platform.core.search",
              "platform.core.generate_esql",
              "platform.core.execute_esql",
              "platform.core.list_indices",
              "platform.core.get_index_mapping",
              "platform.core.get_document_by_id",
            ],
          },
        ],
      },
    });
    console.log("Agent created.\n");
  }

  // Verify
  const { results: updatedAgents } = await kibanaRequest("GET", "/api/agent_builder/agents");
  const agent = updatedAgents.find((a: { id: string }) => a.id === AGENT_ID);
  if (agent) {
    console.log(`✅ Agent "${agent.name}" is ready`);
    console.log(`   Tools: ${agent.configuration.tools[0].tool_ids.join(", ")}`);
  } else {
    console.error("❌ Agent not found after creation");
    process.exit(1);
  }

  console.log("\nDone! You can now chat with the agent via /api/agent-chat or in Kibana.");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
