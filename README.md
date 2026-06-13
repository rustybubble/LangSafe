# LangSafe LingHacks

**Every language is a universe of thought. This LingHacks VII edition helps communities keep them alive.**

An AI-powered platform that autonomously discovers, aggregates, cross-references, and revitalizes endangered language content scattered across the internet — transforming fragments into a unified, searchable, community-reviewed learning archive.

Original project reference: [LangSafe](https://LangSafe.vercel.app)

---

## The Problem

A language dies every two weeks. By 2100, UNESCO estimates half of the world's ~7,000 languages will be extinct — each taking with it centuries of irreplaceable knowledge, oral history, and cultural identity.

The resources to preserve these languages exist, but they're scattered across obscure PDFs, YouTube videos, academic papers, dictionary websites, and government archives in dozens of disconnected sources. A linguist would need months to even *find* them all, let alone cross-reference and synthesize them.

LangSafe deploys a swarm of AI agents that autonomously crawl the web, discover these scattered fragments, extract linguistic data — vocabulary, grammar, audio, cultural context — and synthesize everything into a unified, searchable archive. In minutes, not months.

---

## LingHacks VII Edition

This fork adapts LangSafe for LingHacks VII with a judge-ready, no-key demo path and a stronger impact loop:

- **Demo-safe archive mode** — Jejueo fallback data powers vocabulary, grammar, graph, sources, run history, and language overview screens even without Elasticsearch or API keys.
- **Revitalization Studio** — Community reviewers can verify entries, request elder notes, flag sensitive content, and generate lesson packs from preserved vocabulary.
- **Featherless.ai model layer** — Ask, Studio, source planning, extraction, cross-reference, enrichment, and transcript correction use Featherless's OpenAI-compatible chat API when `FEATHERLESS_API_KEY` is configured, with local fallbacks for live demos where appropriate.
- **Judge Brief** — A dedicated rubric page maps the project to creativity, impact, feasibility, technology, and UI/UX.
- **Human-centered first screen** — A clean blue visual direction and LingHacks framing make the product feel like a preservation tool, not only an agent dashboard.

Suggested demo path:

1. Open `/dashboard`, choose Jejueo, and run preservation.
2. Watch the real-time agent feed populate.
3. Search the Archive tab for `sea`, `haenyeo`, or `badang`.
4. Open Graph and Sources to show relationships and provenance.
5. Open `/studio` to verify entries and generate a lesson pack.
6. Open `/judge-brief` for the rubric-aligned summary.

---

## How It Works

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│  Discovery   │───▶│    Crawl     │───▶│  Extraction  │───▶│ Cross-Reference │───▶│   Archive   │
│              │    │             │    │              │    │                 │    │             │
│ Featherless  │    │ Cheerio     │    │ Featherless  │    │ Featherless     │    │ Elastic     │
│ BrightData   │    │ Stagehand   │    │ OCR/PDF text │    │ Merge & verify  │    │ Jina embed  │
│ SERP API     │    │ BrightData  │    │ PDF parsing  │    │ Deduplication   │    │ Semantic    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────────┘    └─────────────┘
```

1. **Discovery** — Featherless-powered agents plan source discovery across priority archives, verified public resource patterns, and optional BrightData SERP API with 6-tier dynamic queries (core terms, native names, alternate names, contact languages, country-specific, language family), generating up to 24 targeted queries per language

2. **Crawl** — Each discovered source is fetched through a 3-tier cascade: specialized crawlers (YouTube, Wikipedia, ELAR, dictionaries) → BrightData Web Unlocker (CAPTCHA bypass) → Cheerio/Stagehand (headless browser). PDFs are parsed with text extraction and scanned/OCR fallbacks

3. **Extraction** — Featherless processes each source in a schema-guided tool-use loop, extracting structured vocabulary entries (headword, definitions, IPA, conjugations, morphology, examples) and grammar patterns (9 categories) into Elasticsearch

4. **Cross-Reference** — A second Featherless agent searches for duplicate entries across sources, merging definitions, examples, and cross-references while calculating reliability scores based on source count

5. **Archive** — All data flows into Elasticsearch with Jina v3 embeddings (1024-dim) for semantic search, reranking, and knowledge graph generation

---

## Features

- **Multi-Agent Pipeline** — Orchestrated Discovery, Extraction, and Cross-Reference agents with real-time event streaming via Socket.io
- **Real-Time Dashboard** — Split-panel UI with live agent activity feed and a 200-event ring buffer for late-joining clients
- **Semantic Search** — Elasticsearch multi-match queries with Jina AI embeddings and reranking for vocabulary and grammar patterns
- **Knowledge Graph** — Force-directed graph visualization (react-force-graph-2d) with 3 edge types: related terms, semantic clusters, and embedding similarity
- **Grammar Reference** — Browsable grammar patterns across 9 categories (verb conjugation, particles, sentence structure, honorifics, negation, questions, phonological rules, morphological rules)
- **Language Browser** — 5,352 endangered languages from Glottolog CLDF with filtering by endangerment status, macroarea, language family, and speaker count
- **Interactive Maps** — Leaflet maps with marker, heatmap, and choropleth modes showing global language endangerment
- **Community Review** — Speaker, teacher, and linguist review modes for verification, elder follow-up, and sensitive-content flagging
- **Lesson Pack Builder** — Generates classroom, family, and fieldwork-ready learning packs from archive vocabulary and grammar
- **Judge Brief** — Rubric-aligned demo narrative for hackathon presentations
- **Offline Demo Fallbacks** — Search, grammar, graph, sources, run artifacts, stats, and overview routes degrade to realistic Jejueo demo data
- **Audio Pipeline** — YouTube audio extraction with Whisper transcription (RunPod serverless), word-level timestamps, and pronunciation avatar generation (HeyGen)
- **PDF & Scan Extraction** — Text extraction via pdf-parse with scanned/OCR extraction paths for degraded documents
- **Adaptive Web Crawling** — Domain-specific crawlers with BrightData Web Unlocker for geo-blocked and CAPTCHA-protected sources

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion, socket.io-client |
| **Visualization** | react-force-graph-2d, Leaflet + react-leaflet, Recharts, D3.js |
| **Backend** | Express 5, Socket.io, Node.js (tsx runtime) |
| **AI Agents** | Featherless.ai OpenAI-compatible chat completions, schema-guided tool-use loops |
| **Lesson Generation** | Featherless.ai OpenAI-compatible chat completions, demo fallback generator |
| **Search & Discovery** | Featherless source planning, priority archives, BrightData SERP API + Web Unlocker |
| **Embeddings** | Jina AI v3 (embeddings) + v2 (reranking) |
| **Data Store** | Elasticsearch 9 (serverless) — vocabulary, grammar, languages, pipeline runs |
| **Web Crawling** | Cheerio, Browserbase + Stagehand, pdf-parse, pdfjs-dist |
| **Audio/ML** | Python FastAPI, RunPod (Whisper transcription), HeyGen (avatar videos) |
| **Infrastructure** | Vercel (frontend), Cloudflare Workers (R2 storage + KV cache) |
| **Validation** | TypeScript 5 (strict), Zod 4 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (:3000)                       │
│  Next.js 16 App Router  ·  React 19  ·  Socket.io Client    │
└────────────┬──────────────────────────────┬──────────────────┘
             │ HTTP (API Routes)            │ WebSocket
             ▼                              ▼
┌────────────────────────┐    ┌────────────────────────────────┐
│   Next.js API Routes   │    │   Express + Socket.io (:3001)  │
│                        │    │                                │
│  /api/search           │    │  Pipeline Orchestrator         │
│  /api/grammar          │    │  Discovery Agent               │
│  /api/languages        │    │  Extraction Agent              │
│  /api/graph            │    │  Cross-Reference Agent         │
│  /api/preserve ────────┼───▶│  Enrichment Agent              │
│                        │    │  Event Emitter (ring buffer)   │
└────────┬───────────────┘    └──────┬─────────────────────────┘
         │                           │
         ▼                           ▼
┌────────────────────┐    ┌────────────────────────────────────┐
│  Elasticsearch 9   │    │   Python FastAPI (:3003)           │
│  (Serverless)      │    │                                    │
│                    │    │   YouTube audio extraction         │
│  vocabulary        │    │   Whisper transcription (RunPod)   │
│  grammar_patterns  │    │   Word-level timestamps            │
│  languages (5,352) │    └────────────────────────────────────┘
│  language_resources│
│  pipeline_runs     │
└────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+ (for ML service)
- npm

### Install

```bash
git clone https://github.com/rustybubble/LangSafe.git langsafe-linghacks
cd langsafe-linghacks
npm install --legacy-peer-deps
```

### Environment Variables

Create a `.env.local` file in the project root:

| Variable | Required | Description |
|---|---|---|
| `ELASTIC_URL` | Yes | Elasticsearch cluster URL |
| `ELASTIC_API_KEY` | Yes | Elasticsearch API key |
| `FEATHERLESS_API_KEY` | Yes for live AI | Featherless.ai key for Ask, Studio, discovery planning, extraction, cross-reference, enrichment, and transcript correction |
| `FEATHERLESS_MODEL` | No | Featherless model ID, defaults to `Qwen/Qwen2.5-7B-Instruct` |
| `JINA_API_KEY` | Yes | Jina AI key (embeddings + reranking) |
| `NEXT_PUBLIC_WS_URL` | No | WebSocket server URL (default: `http://localhost:3001`) |
| `BROWSERBASE_API_KEY` | No | Browserbase API key (headless browsing) |
| `BROWSERBASE_PROJECT_ID` | No | Browserbase project ID |
| `BRIGHTDATA_API_TOKEN` | No | BrightData API token (SERP + Web Unlocker) |
| `CLOUDFLARE_WORKER_URL` | No | Cloudflare Worker URL (R2 storage + KV cache) |
| `HEYGEN_API_KEY` | No | HeyGen API key (pronunciation avatar videos) |
| `ML_SERVICE_URL` | No | Python ML service URL (default: `http://localhost:3003`) |
| `RUNPOD_API_KEY` | No | RunPod API key (Whisper GPU transcription) |
| `RUNPOD_ENDPOINT_ID` | No | RunPod endpoint ID |

### Data Setup

Ingest the Glottolog CLDF dataset (5,352 endangered languages) and generate map data:

```bash
npm run setup:data
```

### Run

```bash
# Start all services (Next.js + WebSocket server + ML service)
npm run dev:all

# Or start individually:
npm run dev       # Next.js frontend on :3000
npm run server    # WebSocket server on :3001
npm run ml        # Python ML service on :3003
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

The LingHacks demo also works without live API credentials because the app falls back to bundled Jejueo demo data.

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run server` | Start WebSocket server (port 3001) |
| `npm run ml` | Start Python ML service (port 3003) |
| `npm run dev:all` | Start all 3 services concurrently |
| `npm run build` | Build Next.js for production |
| `npm run setup:data` | Full data setup: ingest Glottolog + generate maps + prescan |
| `npm run ingest:glottolog` | Import Glottolog CLDF into Elasticsearch |
| `npm run generate:map` | Generate map visualization data |
| `npm run prescan` | Pre-compute language statistics |
| `npm run backup` | Backup Elasticsearch indices |
| `npm run restore` | Restore Elasticsearch from backup |
| `npm run reindex` | Reindex with custom analyzers |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
LangSafe/
├── app/                        # Next.js App Router
│   ├── (main)/dashboard/       # Preservation dashboard
│   ├── (main)/languages/       # Language browser + detail pages
│   ├── (splash)/               # Landing page
│   └── api/                    # 22 API routes
├── components/                 # React components
│   ├── agent-feed/             # Real-time agent event stream
│   ├── search/                 # Archive search interface
│   ├── graph/                  # Knowledge graph (force-directed)
│   ├── grammar/                # Grammar pattern reference
│   ├── languages/              # Language browser, map, filters
│   ├── results/                # Vocabulary & grammar cards
│   ├── dashboard/              # Stats bar, welcome view
│   └── ui/                     # shadcn/ui primitives
├── lib/                        # Core business logic
│   ├── agents/                 # AI agent implementations
│   ├── crawlers/               # Site-specific crawlers
│   ├── apis/                   # External API clients
│   ├── elastic.ts              # Elasticsearch client
│   ├── types.ts                # Shared TypeScript types
│   └── graph.ts                # Knowledge graph generation
├── server/                     # Express + Socket.io server
│   ├── ws-server.ts            # Server entry point
│   ├── orchestrator.ts         # Pipeline coordinator
│   ├── agents/                 # Server-side agent wrappers
│   └── utils/                  # Event emitter, semaphore, schemas
├── ml/                         # Python FastAPI (audio processing)
├── scripts/                    # CLI scripts (setup, backup, ingest)
├── infra/                      # Cloudflare Workers (R2 + KV)
└── docs/                       # Project documentation
```

---

## Built With

| Sponsor | Integration |
|---|---|
| **Featherless.ai** | OpenAI-compatible Ask tab, lesson generation, source planning, extraction, cross-reference, enrichment, and transcript correction |
| **BrightData** | SERP API for geo-targeted search from inside countries; Web Unlocker for CAPTCHA-protected archives |
| **Browserbase** | Stagehand headless browser for JavaScript-heavy dictionary sites |
| **Jina AI** | v3 embeddings (1024-dim) for semantic search; v2 reranker for result quality |
| **Elastic** | Serverless Elasticsearch for vocabulary, grammar, languages, and pipeline data |
| **HeyGen** | Avatar video generation for pronunciation demonstrations |
| **Cloudflare** | R2 object storage for pipeline artifacts; KV for query caching |
| **RunPod** | Serverless GPU for Whisper audio transcription |

---

## Deployment

The app runs across three services:

| Service | Platform | Purpose |
|---|---|---|
| Next.js frontend + API routes | Vercel | Dashboard, search, language browser |
| WS server + orchestrator + agents | Railway | Pipeline execution, real-time events |
| ML service (optional) | Railway | YouTube audio transcription |

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full deployment guide.

---

## License

MIT

---

*LingHacks VII adaptation, June 13-14, 2026.*
