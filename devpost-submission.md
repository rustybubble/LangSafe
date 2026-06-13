# LangSafe Devpost Submission Draft

## Elevator Pitch

LangSafe is an AI-powered language preservation platform that turns scattered endangered-language resources into a searchable, community-reviewed learning archive. It discovers vocabulary, grammar, sources, and cultural context, then helps speakers, teachers, and linguists verify entries and generate lesson packs with Featherless.ai so preservation can move from static archive to living classroom material.

## Built With

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Featherless.ai, Elasticsearch, Jina AI, BrightData, Browserbase Stagehand, Socket.io, Leaflet, react-force-graph, Recharts, D3, Zod, Node.js, Python/FastAPI, RunPod, HeyGen, Cloudflare R2/KV, Vercel.

## Inspiration

Every language carries a unique way of seeing the world: place names, ecological knowledge, family history, oral tradition, humor, and memory. But many endangered-language resources are scattered across PDFs, dictionary sites, academic papers, videos, audio collections, and small community archives. Even when the information exists, it is hard to find, compare, verify, and teach from.

LangSafe was inspired by that gap between preservation and actual revitalization. We wanted to build something that does more than collect words. The goal was to help communities turn fragile fragments into structured knowledge, then into learning material that speakers, elders, teachers, and heritage learners can actually use.

## What It Does

LangSafe is a computational linguistics platform for endangered-language preservation and revitalization. It can:

- Discover endangered-language resources across the web and archive-like sources.
- Extract vocabulary, definitions, grammar patterns, source provenance, audio metadata, and cultural notes.
- Cross-reference related entries so duplicate or conflicting information can be compared.
- Browse endangered languages globally, including Jejueo as the main LingHacks demo language.
- Search a preservation archive by English, native-script, romanized, or semantic concepts.
- Show language health, source coverage, and a map-based language overview.
- Provide a Community Review Queue where speakers, teachers, and linguists can verify entries, request elder notes, or flag sensitive content.
- Generate classroom, family, or fieldwork lesson packs from verified archive entries.
- Use Featherless.ai through an OpenAI-compatible API route to create live lesson-pack drafts, while keeping a local fallback so the demo still works reliably.

## How We Built It

We built LangSafe with a Next.js 16 and React 19 frontend, TypeScript, Tailwind CSS, shadcn/ui components, and Framer Motion for a polished product experience. The interface has a blue, clean visual system with a dashboard, language browser, judge brief, archive views, map views, and the Revitalization Studio.

On the backend side, we use Next.js API routes, Node.js services, Socket.io for live agent updates, and a demo-safe Jejueo dataset so the app works even without every production credential. The broader architecture supports Elasticsearch for structured vocabulary and grammar retrieval, Jina AI embeddings and reranking for semantic search, Featherless-powered source planning, BrightData for optional live SERP/unlocking, Browserbase/Stagehand for crawling dynamic sources, and Featherless-based extraction/cross-reference agents.

For the LingHacks sponsor integration, Featherless.ai is now the primary model layer. The Ask tab streams grounded archive answers, the Studio generates lesson packs, and the preservation pipeline uses Featherless-compatible agents for discovery planning, extraction, cross-reference, enrichment, and transcript correction.

## Challenges We Ran Into

One challenge was designing around uncertainty. Endangered-language data can be incomplete, contradictory, or culturally sensitive, so the product could not simply "auto-generate truth." We built provenance, confidence, source counts, and human review into the workflow.

Another challenge was demo reliability. A hackathon demo has to work even if search services, databases, or model APIs are slow. We built realistic Jejueo fallback data for search, grammar, graph, sources, stats, language overview, and lesson generation, then added live Featherless.ai generation on top.

We also had to make a complex system understandable quickly. The judges need to see creativity, impact, technology, and UX in a few minutes, so we created a focused Judge Brief page and a Studio flow that shows the product's real community value.

## Accomplishments That We're Proud Of

We are proud that LangSafe connects the whole preservation loop: discovery, archive, verification, and teaching. A lot of language-tech tools stop at retrieval or translation, but LangSafe treats community review and revitalization as first-class parts of the product.

We are also proud of the Revitalization Studio. It makes the project feel less like a backend pipeline and more like something a teacher, speaker, or linguist could actually sit down and use.

Finally, we are proud of the Featherless.ai integration. It gives the project a live AI generation layer for lesson packs while keeping the API key server-side and preserving a fallback path for feasibility.

## What We Learned

We learned that language preservation is not just a data problem. It is a trust, consent, design, and access problem. AI can help find patterns and speed up organization, but communities still need control over what is verified, taught, restricted, or revised.

We also learned how important product framing is. The same technical pipeline feels much more impactful when the UI clearly shows who it helps and what action they can take next.

On the technical side, we learned how to combine retrieval, structured data, fallback datasets, agent pipelines, and open-weight model inference into a demo that is both ambitious and stable.

## What's Next for LangSafe

Next, LangSafe could expand in several directions:

- Add community accounts and role-based permissions for elders, teachers, linguists, and learners.
- Add consent and cultural-sensitivity controls for restricted words, recordings, and stories.
- Support exports to printable lesson plans, Anki decks, CSVs, and community archive formats.
- Improve audio workflows with pronunciation review, transcription alignment, and speaker-approved clips.
- Add more endangered-language demo packs beyond Jejueo.
- Build evaluation tools that compare model-generated lesson packs against verified community guidelines.
- Deploy the full pipeline so communities can preserve and teach from their own language resources.

## 3 Minute Technical Demo Video Script

### 0:00-0:20 - Hook

On screen: LangSafe landing page.

Say: "Every endangered language is more than a vocabulary list. It carries memory, ecological knowledge, family history, place names, and identity. The problem is that the resources are scattered across PDFs, dictionary websites, videos, audio collections, and academic archives. LangSafe turns those fragments into a living, community-reviewed learning archive."

### 0:20-0:45 - System Overview

On screen: Open Dashboard, then the Jejueo language page.

Say: "LangSafe is a full-stack AI preservation platform. The frontend is built with Next.js, React, TypeScript, Tailwind, shadcn UI, and Framer Motion. The backend uses Next API routes, Socket.io event streaming, Elasticsearch-ready data models, Jina-style semantic search, map and graph visualizations, and model-powered workflows. For LingHacks, the main demo language is Jejueo, a critically endangered language of Jeju Island."

### 0:45-1:10 - Language Archive and Metrics

On screen: Jejueo language detail page. Show metrics, map, and About section.

Say: "The language page gives judges the impact layer immediately: estimated speakers, endangerment status, entry count, source count, audio count, grammar patterns, and coverage percentage. This is not just a static profile. It is designed as a preservation workspace where a team can see what has been captured, what is missing, and which language resources need more attention."

### 1:10-1:35 - Archive Search, Grammar, Sources, and Graph

On screen: Open the archive/search area for Jejueo. Show search, grammar, sources, and graph if available.

Say: "The archive supports multiple ways to inspect preserved language data. You can search vocabulary by English meaning, native script, romanization, or semantic cluster. Grammar patterns are stored separately, with examples and related vocabulary. Sources are tracked by type, such as dictionaries, archives, videos, and academic papers. The graph view connects related words, semantic clusters, and source relationships so a linguist can understand the structure of the archive, not just a flat word list."

### 1:35-2:00 - Ask Tab Powered by Featherless.ai

On screen: Open Ask tab and ask, "What Jejueo words have been preserved so far?"

Say: "The Ask tab is now powered by Featherless.ai. The route sends the question plus grounded LangSafe archive context to an open-weight model through Featherless's OpenAI-compatible API. The answer streams back into the UI using server-sent events, so it feels like an agent chat while staying grounded in the current language archive. If production credentials are missing, the route still answers from the bundled demo archive instead of failing."

### 2:00-2:35 - Community Review and Lesson Generation

On screen: Revitalization Studio lesson builder. Click Generate lesson pack and show Featherless.ai badge/model.

Say: "The most important product decision is that humans stay in the loop. In the Revitalization Studio, a speaker, teacher, or linguist can verify entries, request an elder note, or flag sensitive content. Then the right side turns reviewed archive data into learning material. The lesson builder sends selected vocabulary, the grammar focus, audience, quiz setting, and oral-history prompt setting to Featherless.ai. It returns a classroom, family, or fieldwork-ready lesson pack with activities, a quick check, and a community interview prompt. The API key stays server-side."

### 2:35-3:05 - Technical Depth and Close

On screen: Judge Brief page.

Say: "The Judge Brief summarizes the technical stack and rubric alignment. LangSafe combines a polished Next.js interface, API routes, live agent-style streaming, demo-safe fallbacks, Elasticsearch-compatible archive models, Jina-style semantic retrieval, Featherless-powered source planning and extraction, optional BrightData discovery paths, Browserbase crawling support, graph visualization, maps, audio pipeline hooks, and Featherless.ai lesson generation. The core idea is simple but powerful: move endangered-language work from scattered fragments to verified learning materials communities can actually use."

## Suggested Screenshots

- `devpost-screenshots/01-langsafe-hero.png`
- `devpost-screenshots/02-jejueo-language-detail.png`
- `devpost-screenshots/03-featherless-studio.png`
- `devpost-screenshots/04-judge-brief.png`
