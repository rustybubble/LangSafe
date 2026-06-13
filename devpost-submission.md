# LangSafe Devpost Submission Draft

## Elevator Pitch

LangSafe is an AI-powered language preservation platform that turns scattered endangered-language resources into a searchable, community-reviewed learning archive. It discovers vocabulary, grammar, sources, and cultural context, then helps speakers, teachers, and linguists verify entries and generate lesson packs with Featherless.ai so preservation can move from static archive to living classroom material.

## Built With

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Featherless.ai, Anthropic Claude, Elasticsearch, Jina AI, Perplexity Sonar, BrightData, Browserbase Stagehand, Socket.io, Leaflet, react-force-graph, Recharts, D3, Zod, Node.js, Python/FastAPI, RunPod, HeyGen, Cloudflare R2/KV, Vercel.

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

On the backend side, we use Next.js API routes, Node.js services, Socket.io for live agent updates, and a demo-safe Jejueo dataset so the app works even without every production credential. The broader architecture supports Elasticsearch for structured vocabulary and grammar retrieval, Jina AI embeddings and reranking for semantic search, Perplexity and BrightData for discovery, Browserbase/Stagehand for crawling dynamic sources, and Claude-based extraction/cross-reference agents.

For the LingHacks sponsor integration, we added a server-side Featherless.ai route at `/api/featherless/lesson`. The Studio sends selected vocabulary, grammar focus, audience, and lesson options to Featherless using its OpenAI-compatible chat completions API. The response is normalized into a lesson pack with a title, summary, activities, oral-history prompt, and quick check.

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

## 2-3 Minute Demo Video Script

### 0:00-0:15 - Hook

On screen: LangSafe landing page.

Say: "Every endangered language is more than a vocabulary list. It carries memory, ecological knowledge, family history, and identity. The problem is that resources for these languages are often scattered across PDFs, videos, dictionaries, and archives. LangSafe helps turn those fragments into a living, community-reviewed learning archive."

### 0:15-0:35 - What LangSafe Is

On screen: Open the Dashboard or Jejueo language page.

Say: "LangSafe is an AI-powered platform for endangered-language preservation and revitalization. For this LingHacks demo, we focused on Jejueo, the critically endangered language of Jeju Island. The app shows speaker estimates, archive coverage, vocabulary entries, grammar patterns, sources, and preservation status."

### 0:35-1:05 - Language Archive and Impact

On screen: Jejueo language detail page, then scroll or show archive metrics.

Say: "The goal is not just to save isolated words. LangSafe structures the data with source provenance, definitions, romanization, grammar notes, and language-health metrics. A teacher or linguist can see what has been preserved, what sources were used, and what still needs review."

### 1:05-1:35 - Community Review

On screen: Revitalization Studio left panel.

Say: "A key design decision was keeping humans in the loop. In the Revitalization Studio, community members can review archive entries as a speaker, teacher, or linguist. They can verify a term, request an elder note, or flag something that may be sensitive or inaccurate. This makes LangSafe a support tool for communities instead of a system that blindly overwrites them."

### 1:35-2:05 - Featherless.ai Integration

On screen: Revitalization Studio lesson builder. Click Generate lesson pack and show Featherless.ai badge/model.

Say: "For the LingHacks sponsor integration, we connected Featherless.ai through a server-side OpenAI-compatible route. The lesson builder sends selected Jejueo vocabulary, a grammar focus, and the target audience to Featherless. It returns a lesson pack with activities, an oral-history prompt, and a quick check. The API key stays on the server, and we also built a fallback so the demo remains reliable."

### 2:05-2:30 - Judge Brief and Close

On screen: Judge Brief page.

Say: "LangSafe aligns with the LingHacks rubric by combining creativity, social impact, technical depth, feasibility, and a clean UI. It uses modern web tooling, retrieval, AI agents, semantic search, maps, graphs, and open-weight model inference, but the core idea is simple: help endangered-language communities move from scattered fragments to verified learning materials. That's LangSafe."

## Suggested Screenshots

- `devpost-screenshots/01-langsafe-hero.png`
- `devpost-screenshots/02-jejueo-language-detail.png`
- `devpost-screenshots/03-featherless-studio.png`
- `devpost-screenshots/04-judge-brief.png`

## Submission Caution

LingHacks VII's Devpost rules mention that projects must be created during the event period. Since this project was adapted from an earlier codebase, confirm how the organizers want prior work disclosed before submission.
