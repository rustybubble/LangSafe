# LangSafe 3 Minute Technical Demo Video Script

## 0:00-0:20 - Hook

On screen: Open the LangSafe home page.

Say: "Every endangered language carries more than words. It carries place names, ecological knowledge, family memory, humor, oral history, and identity. But the resources that preserve those languages are usually scattered across PDFs, dictionary websites, YouTube videos, audio collections, academic papers, and small community archives. LangSafe turns those scattered fragments into a living, searchable, community-reviewed learning archive."

## 0:20-0:45 - Product Overview

On screen: Go from the home page to the Jejueo language page.

Say: "For LingHacks, I focused the demo around Jejueo, a critically endangered language from Jeju Island. LangSafe is designed as a full preservation workspace: it shows language health, archived vocabulary, grammar patterns, source coverage, audio counts, maps, and a review workflow. The idea is not just to collect data, but to help speakers, teachers, and linguists turn preserved material into usable learning resources."

## 0:45-1:15 - Technical Stack

On screen: Show the Judge Brief or About page while scrolling through the stack.

Say: "Technically, LangSafe is built with Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn UI, Framer Motion, and server-side API routes. The archive model is Elasticsearch-ready, with structured vocabulary, grammar, sources, language metadata, and source cross-references. The interface uses Leaflet for geography, Recharts and D3 for metrics, and a graph view to represent relationships between words, semantic clusters, and sources. The backend is designed around agent-style workflows, with Socket.io events for live preservation runs and Zod schemas to keep extracted data structured."

## 1:15-1:45 - Archive and Search

On screen: On `/languages/jeju1234`, show the metrics, then the Archive tab. Search or point at entries like `바당`, `해녀`, and `물질`.

Say: "This archive view is where the preserved data becomes usable. A user can search by English meaning, native script, romanization, part of speech, semantic cluster, source count, or audio availability. Each entry keeps definitions, translations, cultural tags, related terms, and source references. This matters because endangered-language work often has incomplete or conflicting sources, so LangSafe keeps confidence and provenance visible instead of hiding uncertainty."

## 1:45-2:10 - Featherless.ai Ask Tab

On screen: Open the Ask tab and ask: `What Jejueo words in this archive relate to ocean culture?`

Say: "The Ask tab is powered by Featherless.ai. The server route gathers the current LangSafe archive context, sends a grounded prompt through Featherless's OpenAI-compatible API, and streams the response back with server-sent events. That means the answer feels conversational, but it is still based on the language archive instead of being a generic chatbot. I also built fallback behavior so the hackathon demo still works if a supporting service is unavailable."

## 2:10-2:40 - Full Preservation Pipeline

On screen: Show Sources, Graph, and then the Revitalization Studio.

Say: "Behind the UI, the larger pipeline is modular. Featherless is used for source planning, extraction, cross-reference, enrichment, Ask responses, lesson generation, and transcript correction. Browserbase Stagehand can handle JavaScript-heavy dictionary or media pages, BrightData can be plugged in for web unlocking or discovery, Jina-style retrieval supports semantic search, and the audio hooks are ready for Whisper transcription and pronunciation workflows. The key design choice is that all of this feeds back into a reviewable archive, not an unverified AI output."

## 2:40-3:15 - Revitalization Studio and Close

On screen: In Studio, show the Community Review Queue and generate a lesson pack.

Say: "The Revitalization Studio is the impact layer. A teacher, speaker, or linguist can review entries, request elder notes, flag sensitive content, and generate classroom or family learning material from verified vocabulary. The lesson generator sends selected archive entries, audience level, grammar focus, quiz settings, and oral-history prompts to Featherless, then returns a practical lesson pack. So the final result is not just a database. LangSafe connects discovery, preservation, human review, and teaching. It helps endangered-language communities move from scattered documentation to living learning material."
