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

Use this as the full narration. The same script is also saved as `devpost-video-script.md` for recording.

### 0:00-0:20 - Hook

On screen: Open the LangSafe home page.

Say: "Every endangered language carries more than words. It carries place names, ecological knowledge, family memory, humor, oral history, and identity. But the resources that preserve those languages are usually scattered across PDFs, dictionary websites, YouTube videos, audio collections, academic papers, and small community archives. LangSafe turns those scattered fragments into a living, searchable, community-reviewed learning archive."

### 0:20-0:45 - Product Overview

On screen: Go from the home page to the Jejueo language page.

Say: "For LingHacks, I focused the demo around Jejueo, a critically endangered language from Jeju Island. LangSafe is designed as a full preservation workspace: it shows language health, archived vocabulary, grammar patterns, source coverage, audio counts, maps, and a review workflow. The idea is not just to collect data, but to help speakers, teachers, and linguists turn preserved material into usable learning resources."

### 0:45-1:15 - Technical Stack

On screen: Show the Judge Brief or About page while scrolling through the stack.

Say: "Technically, LangSafe is built with Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn UI, Framer Motion, and server-side API routes. The archive model is Elasticsearch-ready, with structured vocabulary, grammar, sources, language metadata, and source cross-references. The interface uses Leaflet for geography, Recharts and D3 for metrics, and a graph view to represent relationships between words, semantic clusters, and sources. The backend is designed around agent-style workflows, with Socket.io events for live preservation runs and Zod schemas to keep extracted data structured."

### 1:15-1:45 - Archive and Search

On screen: On `/languages/jeju1234`, show the metrics, then the Archive tab. Search or point at entries like `바당`, `해녀`, and `물질`.

Say: "This archive view is where the preserved data becomes usable. A user can search by English meaning, native script, romanization, part of speech, semantic cluster, source count, or audio availability. Each entry keeps definitions, translations, cultural tags, related terms, and source references. This matters because endangered-language work often has incomplete or conflicting sources, so LangSafe keeps confidence and provenance visible instead of hiding uncertainty."

### 1:45-2:10 - Featherless.ai Ask Tab

On screen: Open the Ask tab and ask: `What Jejueo words in this archive relate to ocean culture?`

Say: "The Ask tab is powered by Featherless.ai. The server route gathers the current LangSafe archive context, sends a grounded prompt through Featherless's OpenAI-compatible API, and streams the response back with server-sent events. That means the answer feels conversational, but it is still based on the language archive instead of being a generic chatbot. I also built fallback behavior so the hackathon demo still works if a supporting service is unavailable."

### 2:10-2:40 - Full Preservation Pipeline

On screen: Show Sources, Graph, and then the Revitalization Studio.

Say: "Behind the UI, the larger pipeline is modular. Featherless is used for source planning, extraction, cross-reference, enrichment, Ask responses, lesson generation, and transcript correction. Browserbase Stagehand can handle JavaScript-heavy dictionary or media pages, BrightData can be plugged in for web unlocking or discovery, Jina-style retrieval supports semantic search, and the audio hooks are ready for Whisper transcription and pronunciation workflows. The key design choice is that all of this feeds back into a reviewable archive, not an unverified AI output."

### 2:40-3:15 - Revitalization Studio and Close

On screen: In Studio, show the Community Review Queue and generate a lesson pack.

Say: "The Revitalization Studio is the impact layer. A teacher, speaker, or linguist can review entries, request elder notes, flag sensitive content, and generate classroom or family learning material from verified vocabulary. The lesson generator sends selected archive entries, audience level, grammar focus, quiz settings, and oral-history prompts to Featherless, then returns a practical lesson pack. So the final result is not just a database. LangSafe connects discovery, preservation, human review, and teaching. It helps endangered-language communities move from scattered documentation to living learning material."

## Suggested Screenshots

- `devpost-screenshots/01-langsafe-home.png`
- `devpost-screenshots/02-jejueo-language-detail.png`
- `devpost-screenshots/03-featherless-ask-tab.png`
- `devpost-screenshots/04-judge-brief.png`
- `devpost-screenshots/05-featherless-studio.png`
