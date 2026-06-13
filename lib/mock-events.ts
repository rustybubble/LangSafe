import { AgentEvent, VocabularyEntry, LanguageStats } from "./types";
import type { GraphData } from "./api";

// ---------------------------------------------------------------------------
// 30-event simulation of a full LangSafe agent run for Jejueo (제주어)
// ---------------------------------------------------------------------------

const RUN_EVENTS: Omit<AgentEvent, "id" | "timestamp">[] = [
  // ── PHASE 1: Discovery (10 events) ──────────────────────────────────────
  {
    agent: "orchestrator",
    action: "session_started",
    status: "complete",
    data: {
      message:
        "Launching preservation run for Jejueo (제주어) — UNESCO critically endangered, fewer than 5,000 fluent speakers remain. Targeting an estimated 20,000-word vocabulary",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://www2.hawaii.edu/~chin/jejueo/",
      title: "University of Hawaiʻi Jejueo Dictionary",
      type: "dictionary",
      count: 9200,
      message:
        "Pinpointed the Chin & O'Grady lexicon at UH Manoa — 9,200 headwords with Standard Korean glosses, the most comprehensive Jejueo dictionary in existence",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://talkingdictionary.swarthmore.edu/jejueo/",
      title: "Jejueo Talking Dictionary (Swarthmore / ELA)",
      type: "dictionary",
      count: 4500,
      message:
        "Swarthmore's Talking Dictionary — 4,500 headwords with native speaker audio, many recorded from the last generation of fluent elders",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://ko.wikipedia.org/wiki/제주어",
      title: "Wikipedia — 제주어 (Jejueo)",
      type: "wiki",
      message:
        "Korean Wikipedia has grammar tables and a full phonological inventory — useful for mapping Jejueo's vowel system (8 vowels vs. Standard Korean's 7)",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://youtube.com/@jejueo-saturi",
      title: "Jejueo Saturi YouTube Channel",
      type: "video",
      count: 112,
      message:
        "Surfaced 112 conversational videos — native Jeju speakers in unscripted dialogue, the kind of natural speech that written dictionaries can't capture",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://namu.wiki/w/제주도%20방언",
      title: "Namu Wiki — 제주도 방언 (Jeju Dialect)",
      type: "wiki",
      message:
        "Namu Wiki's dialect page has crowd-sourced comparison tables — Jejueo mapped against Standard Korean, with slang and idioms you won't find in academic sources",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://doi.org/10.1515/jsall-2019-2006",
      title: "Yang (2019) — Jejueo Clause Structure and Evidentiality",
      type: "academic",
      message:
        "Yang's 2019 paper on Jejueo evidentiality — peer-reviewed grammar analysis with interlinear glossed examples, useful for extracting clause-level patterns",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://www.jeju.go.kr/culture/dialect/",
      title: "Jeju Special Self-Governing Province — Dialect Institute",
      type: "dictionary",
      count: 14000,
      message:
        "The provincial government's own dictionary — 14,000 entries tagged by sub-dialect region (Seongsan, Hallim, Daejeong). This is the largest single source",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://elar.soas.ac.uk/Collection/MPI1032013",
      title: "ELAR — Endangered Languages Archive (Jejueo Collection)",
      type: "archive",
      count: 340,
      message:
        "SOAS ELAR collection — 340 field recordings from elder speakers (2008-2017). Some of these speakers have since passed. Irreplaceable material",
    },
  },
  {
    agent: "discovery",
    action: "found_source",
    status: "complete",
    data: {
      url: "https://jejueo.org",
      title: "제주어보전회 — Jeju Language Preservation Society",
      type: "archive",
      count: 620,
      message:
        "The Preservation Society's archive — 620 transcribed oral histories and folk tales, community-collected over two decades",
    },
  },

  // ── PHASE 2: Extraction (12 events) ─────────────────────────────────────
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "University of Hawaiʻi Jejueo Dictionary",
      type: "dictionary",
      count: 847,
      message:
        "Pulled 847 entries from the UH lexicon — full POS tagging, Standard Korean glosses, and romanization following the Chin & O'Grady system",
    },
  },
  {
    agent: "extraction",
    action: "extracting_audio",
    status: "complete",
    data: {
      title: "Jejueo Talking Dictionary (Swarthmore / ELA)",
      type: "dictionary",
      count: 23,
      message:
        "Captured 23 native speaker audio clips from the Talking Dictionary — WAV format, studio quality, predominantly female speakers aged 70+",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Jejueo Talking Dictionary (Swarthmore / ELA)",
      type: "dictionary",
      count: 312,
      message:
        "Parsed 312 vocabulary entries with etymological notes — several trace back to Middle Korean forms that Standard Korean lost centuries ago",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Wikipedia — 제주어 (Jejueo)",
      type: "wiki",
      count: 58,
      message:
        "Mapped 58 grammar patterns from Wikipedia's phonology and morphology tables — including the ㅿ (arae-a) vowel distinctions unique to Jejueo",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Jejueo Saturi YouTube Channel",
      type: "video",
      count: 204,
      message:
        "Transcribed 112 videos via Whisper and extracted 204 vocabulary entries — colloquial terms like 혼저옵서예 (welcome) that only appear in spoken Jejueo",
    },
  },
  {
    agent: "extraction",
    action: "extracting_audio",
    status: "complete",
    data: {
      title: "Jejueo Saturi YouTube Channel",
      type: "video",
      count: 87,
      message:
        "Isolated 87 word-level pronunciation segments from video audio — clean cuts between speaker turns, ready for phonetic analysis",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Namu Wiki — 제주도 방언 (Jeju Dialect)",
      type: "wiki",
      count: 176,
      message:
        "Harvested 176 Jejueo-to-Standard Korean mapping pairs — crowd-sourced data catches informal registers that academic dictionaries tend to miss",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Yang (2019) — Jejueo Clause Structure and Evidentiality",
      type: "academic",
      count: 34,
      message:
        "Extracted 34 grammatical constructions from Yang's interlinear glosses — evidential markers (-en, -eun) that distinguish firsthand from reported knowledge",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "Jeju Special Self-Governing Province — Dialect Institute",
      type: "dictionary",
      count: 1563,
      message:
        "Pulled 1,563 entries from the provincial dictionary — sub-dialect tags reveal how the same word shifts between Seongsan, Hallim, and Daejeong villages",
    },
  },
  {
    agent: "extraction",
    action: "extracting_audio",
    status: "complete",
    data: {
      title: "ELAR — Endangered Languages Archive (Jejueo Collection)",
      type: "archive",
      count: 156,
      message:
        "Processed 156 field recordings with time-aligned transcriptions — speaker ages range from 68 to 94 at time of recording",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "ELAR — Endangered Languages Archive (Jejueo Collection)",
      type: "archive",
      count: 489,
      message:
        "Unearthed 489 entries from oral transcriptions — terms for traditional tools and fishing methods that never made it into published dictionaries",
    },
  },
  {
    agent: "extraction",
    action: "extracting_vocabulary",
    status: "complete",
    data: {
      title: "제주어보전회 — Jeju Language Preservation Society",
      type: "archive",
      count: 381,
      message:
        "Extracted 381 entries from oral histories — dense with agricultural and shamanic ritual vocabulary, including terms for the 18,000 gods of Jeju mythology",
    },
  },

  // ── PHASE 3: Cross-Reference (8 events) ────────────────────────────────
  {
    agent: "cross_reference",
    action: "linked_entries",
    status: "complete",
    data: {
      count: 4,
      message:
        "바당 (badang, 'sea') confirmed across 4 independent sources — consistent phonology, Standard Korean 바다 shifted to 바당 via vowel harmony",
    },
  },
  {
    agent: "cross_reference",
    action: "linked_entries",
    status: "complete",
    data: {
      count: 5,
      message:
        "해녀 (haenyeo, 'female diver') verified in 5 sources — variant spelling 헤녀 found in older Seongsan recordings, 3 distinct audio samples matched",
    },
  },
  {
    agent: "cross_reference",
    action: "semantic_clustering",
    status: "complete",
    data: {
      count: 47,
      message:
        "Maritime cluster formed — 47 terms for the sea, diving, and coastal life. Jejueo has far richer maritime vocabulary than Standard Korean, reflecting haenyeo culture",
    },
  },
  {
    agent: "cross_reference",
    action: "semantic_clustering",
    status: "complete",
    data: {
      count: 63,
      message:
        "Kinship cluster assembled — 63 terms. Jejueo preserves distinctions Standard Korean has collapsed: 하르방/할망 (grandparents) vs. 아방/어멍 (parents) vs. 삼촌 (any adult man)",
    },
  },
  {
    agent: "cross_reference",
    action: "semantic_clustering",
    status: "complete",
    data: {
      count: 89,
      message:
        "Agriculture cluster mapped — 89 terms for crops, fields, and farming tools. Jeju's volcanic soil created unique agricultural vocabulary not shared with the mainland",
    },
  },
  {
    agent: "cross_reference",
    action: "linked_entries",
    status: "complete",
    data: {
      count: 1847,
      message:
        "Cross-checked 1,847 entries against 2+ independent sources each — 92% agreement rate, discrepancies mostly in romanization conventions",
    },
  },
  {
    agent: "cross_reference",
    action: "linked_entries",
    status: "complete",
    data: {
      count: 266,
      message:
        "Paired 266 audio clips to their dictionary headwords — 6.3% of the vocabulary now has recorded pronunciation, concentrated in the maritime and kinship domains",
    },
  },
  {
    agent: "orchestrator",
    action: "progress_update",
    status: "complete",
    data: {
      count: 4214,
      message:
        "Preservation run complete — 4,214 unique Jejueo entries archived from 10 sources across dictionaries, field recordings, video, and community archives. 21.1% of the estimated vocabulary captured",
    },
  },
];

// ---------------------------------------------------------------------------
// simulateAgentRun — fires events one at a time with realistic delays
// ---------------------------------------------------------------------------

type EventCallback = (event: AgentEvent) => void;

export function simulateAgentRun(onEvent: EventCallback): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let index = 0;
  let cancelled = false;

  function scheduleNext() {
    if (cancelled || index >= RUN_EVENTS.length) return;

    const delay = 300 + Math.random() * 500; // 300–800 ms
    timeoutId = setTimeout(() => {
      if (cancelled) return;

      const template = RUN_EVENTS[index];

      // Briefly emit a "running" version, then resolve to "complete" after a short beat
      const runningEvent: AgentEvent = {
        ...template,
        id: `evt-${index.toString().padStart(3, "0")}`,
        status: "running",
        timestamp: new Date().toISOString(),
      };
      onEvent(runningEvent);

      const resolveDuration = 150 + Math.random() * 350; // 150–500 ms
      timeoutId = setTimeout(() => {
        if (cancelled) return;

        const completeEvent: AgentEvent = {
          ...template,
          id: runningEvent.id,
          status: template.status,
          timestamp: new Date().toISOString(),
        };
        onEvent(completeEvent);

        index++;
        scheduleNext();
      }, resolveDuration);
    }, delay);
  }

  scheduleNext();

  return () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}

// ---------------------------------------------------------------------------
// createInitialEvents — returns an empty array so the feed starts blank
// and fills up via simulateAgentRun()
// ---------------------------------------------------------------------------

export function createInitialEvents(): AgentEvent[] {
  return [];
}

// ---------------------------------------------------------------------------
// Mock search results (vocabulary entries for the right panel)
// ---------------------------------------------------------------------------

export const MOCK_SEARCH_RESULTS: VocabularyEntry[] = [
  {
    id: "voc-001",
    headword_native: "바당",
    headword_romanized: "badang",
    pos: "noun",
    definitions: [
      { language: "en", text: "Sea, ocean" },
      { language: "ko", text: "바다" },
    ],
    example_sentences: [
      {
        target: "바당이 곱다",
        contact: "바다가 아름답다",
        english: "The sea is beautiful",
        source_url: "https://www2.hawaii.edu/~chin/jejueo/entry/badang",
      },
    ],
    audio_url: "https://audio.example.com/badang.mp3",
    related_terms: ["물", "갯것", "바름"],
    cross_references: [
      {
        source_title: "UH Jejueo Dictionary",
        source_url: "https://www2.hawaii.edu/~chin/jejueo/",
        source_type: "dictionary",
        definition: "Sea, ocean — the body of salt water surrounding Jeju Island",
        notes: "Romanized as 'badang'; compare Standard Korean 바다 (bada)",
      },
      {
        source_title: "Jeju Provincial Dictionary",
        source_url: "https://www.jeju.go.kr/culture/dialect/",
        source_type: "dictionary",
        definition: "바다; 넓은 물. 제주 전역에서 사용되는 기본 어휘",
        notes: "Regional sub-dialect tags: 성산, 한림, 대정 — uniform usage across all regions",
      },
      {
        source_title: "ELAR Jejueo Collection",
        source_url: "https://elar.soas.ac.uk/Collection/MPI1032013",
        source_type: "archive",
        definition: "Sea (general term for open water); used broadly in haenyeo diving narratives",
        notes: "Frequently co-occurs with 물질 (muljil) and 갯것 (gaetgeot) in oral recordings",
      },
      {
        source_title: "Jejueo Talking Dictionary",
        source_url: "https://talkingdictionary.swarthmore.edu/jejueo/",
        source_type: "dictionary",
        definition: "Ocean, the sea; large body of water",
        notes: "Audio sample available — elder female speaker, recorded 2014",
      },
    ],
    semantic_cluster: "maritime",
  },
  {
    id: "voc-002",
    headword_native: "해녀",
    headword_romanized: "haenyeo",
    pos: "noun",
    definitions: [
      { language: "en", text: "Female diver; woman of the sea (Jeju tradition)" },
      { language: "ko", text: "해녀 (제주 전통 여성 잠수부)" },
    ],
    example_sentences: [
      {
        target: "해녀들이 물질헹 갯것 잡앙 온다",
        contact: "해녀들이 물질해서 해산물 잡아 온다",
        english: "The haenyeo dive and bring back seafood",
        source_url: "https://elar.soas.ac.uk/Collection/MPI1032013",
      },
    ],
    audio_url: "https://audio.example.com/haenyeo.mp3",
    related_terms: ["바당", "갯것", "물질", "테왁", "빌레"],
    cross_references: [
      {
        source_title: "ELAR Jejueo Collection",
        source_url: "https://elar.soas.ac.uk/Collection/MPI1032013",
        source_type: "archive",
        definition: "Female free-diver of Jeju; women who harvest shellfish and seaweed from the ocean without breathing equipment",
        notes: "Variant spelling 헤녀 (henyeo) found in older recordings from 성산 speakers",
      },
      {
        source_title: "제주어보전회",
        source_url: "https://jejueo.org",
        source_type: "archive",
        definition: "해녀 — 제주 여성 잠수부. 물질을 직업으로 하는 여성을 총칭",
        notes: "UNESCO Intangible Cultural Heritage of Humanity (2016)",
      },
      {
        source_title: "Wikipedia — 제주어",
        source_url: "https://ko.wikipedia.org/wiki/제주어",
        source_type: "wiki",
        definition: "Professional female diver; an iconic cultural figure of Jeju Island with a tradition spanning centuries",
        notes: "Estimated 4,500 active haenyeo remaining as of 2023, average age 72",
      },
      {
        source_title: "Jejueo Saturi YouTube",
        source_url: "https://youtube.com/@jejueo-saturi",
        source_type: "video",
        definition: "Woman diver; Jeju sea woman who dives for abalone, conch, and seaweed",
        notes: "Mentioned in 38 of 112 lesson videos; often paired with 물질 (muljil)",
      },
      {
        source_title: "UH Jejueo Dictionary",
        source_url: "https://www2.hawaii.edu/~chin/jejueo/",
        source_type: "dictionary",
        definition: "Female diver; woman of the sea engaged in traditional breath-hold diving",
        notes: "Cross-referenced with related entries: 물질, 테왁, 빌레, 갯것",
      },
    ],
    semantic_cluster: "maritime",
  },
  {
    id: "voc-003",
    headword_native: "하르방",
    headword_romanized: "hareubang",
    pos: "noun",
    definitions: [
      { language: "en", text: "Grandfather; elderly man" },
      { language: "ko", text: "할아버지" },
    ],
    example_sentences: [
      {
        target: "우리 하르방 집이 어디우꽈?",
        contact: "우리 할아버지 집이 어디입니까?",
        english: "Where is our grandfather's house?",
        source_url: "https://talkingdictionary.swarthmore.edu/jejueo/",
      },
    ],
    audio_url: "https://audio.example.com/hareubang.mp3",
    related_terms: ["할망", "아방", "어멍", "삼촌"],
    cross_references: [
      {
        source_title: "Jejueo Talking Dictionary",
        source_url: "https://talkingdictionary.swarthmore.edu/jejueo/",
        source_type: "dictionary",
      },
      {
        source_title: "Jeju Provincial Dictionary",
        source_url: "https://www.jeju.go.kr/culture/dialect/",
        source_type: "dictionary",
      },
    ],
    semantic_cluster: "kinship",
  },
  {
    id: "voc-004",
    headword_native: "갯것",
    headword_romanized: "gaetgeot",
    pos: "noun",
    definitions: [
      { language: "en", text: "Seafood; things from the sea" },
      { language: "ko", text: "해산물" },
    ],
    example_sentences: [
      {
        target: "오늘 갯것 잡으렌 바당에 가크라",
        contact: "오늘 해산물 잡으러 바다에 가겠다",
        english: "I will go to the sea today to catch seafood",
        source_url: "https://www.jeju.go.kr/culture/dialect/entry/gaetgeot",
      },
    ],
    audio_url: "https://audio.example.com/gaetgeot.mp3",
    related_terms: ["바당", "해녀", "물"],
    cross_references: [
      {
        source_title: "Jeju Provincial Dictionary",
        source_url: "https://www.jeju.go.kr/culture/dialect/",
        source_type: "dictionary",
      },
      {
        source_title: "Yang (2019) — Jejueo Clause Structure",
        source_url: "https://doi.org/10.1515/jsall-2019-2006",
        source_type: "academic",
      },
    ],
    semantic_cluster: "maritime",
  },
  {
    id: "voc-005",
    headword_native: "먹다",
    headword_romanized: "meokda",
    pos: "verb",
    definitions: [
      { language: "en", text: "To eat, to consume" },
      { language: "ko", text: "먹다" },
    ],
    example_sentences: [
      {
        target: "밥 먹엉 가라",
        contact: "밥 먹고 가라",
        english: "Eat your meal before you go",
        source_url: "https://www2.hawaii.edu/~chin/jejueo/entry/meokda",
      },
    ],
    audio_url: "https://audio.example.com/meokda.mp3",
    related_terms: ["밥", "마시다", "들다"],
    cross_references: [
      {
        source_title: "UH Jejueo Dictionary",
        source_url: "https://www2.hawaii.edu/~chin/jejueo/",
        source_type: "dictionary",
      },
      {
        source_title: "Jejueo Saturi YouTube",
        source_url: "https://youtube.com/@jejueo-saturi",
        source_type: "video",
      },
    ],
    semantic_cluster: "daily-life",
  },
  {
    id: "voc-006",
    headword_native: "물질",
    headword_romanized: "muljil",
    pos: "noun",
    definitions: [
      { language: "en", text: "Diving work; the practice of free-diving for seafood (haenyeo tradition)" },
      { language: "ko", text: "물질 (해녀의 잠수 작업)" },
    ],
    example_sentences: [
      {
        target: "어멍이 물질 가신디 아직 안 옵서",
        contact: "어머니가 물질 가셨는데 아직 안 오셨어",
        english: "Mother went diving but hasn't come back yet",
        source_url: "https://jejueo.org/oral-history/muljil",
      },
    ],
    audio_url: "https://audio.example.com/muljil.mp3",
    related_terms: ["해녀", "테왁", "바당", "갯것", "빌레"],
    cross_references: [
      {
        source_title: "제주어보전회",
        source_url: "https://jejueo.org",
        source_type: "archive",
        definition: "물질 — 해녀가 바당에서 해산물을 채취하는 잠수 작업",
        notes: "Oral histories describe seasonal 물질 patterns tied to lunar calendar",
      },
      {
        source_title: "ELAR Jejueo Collection",
        source_url: "https://elar.soas.ac.uk/Collection/MPI1032013",
        source_type: "archive",
        definition: "Diving work; the traditional practice of free-diving to harvest marine resources without equipment",
        notes: "Field recordings include 물질 work songs (해녀노래) from 3 villages",
      },
      {
        source_title: "Namu Wiki — 제주도 방언",
        source_url: "https://namu.wiki/w/제주도%20방언",
        source_type: "wiki",
        definition: "해녀의 잠수 작업. 넓은 의미로 바다에서 하는 모든 채취 활동을 포함",
        notes: "Broader usage than Standard Korean — includes shore gathering, not just diving",
      },
    ],
    semantic_cluster: "maritime",
  },
  {
    id: "voc-007",
    headword_native: "밧",
    headword_romanized: "bat",
    pos: "noun",
    definitions: [
      { language: "en", text: "Field; farmland; dry field (as opposed to paddy)" },
      { language: "ko", text: "밭" },
    ],
    example_sentences: [
      {
        target: "밧디 가멍 보리 심으쿠다",
        contact: "밭에 가서 보리를 심자",
        english: "Let's go to the field and plant barley",
        source_url: "https://www.jeju.go.kr/culture/dialect/entry/bat",
      },
    ],
    related_terms: ["보리", "콩", "조", "쿨", "낭"],
    cross_references: [
      {
        source_title: "Jeju Provincial Dictionary",
        source_url: "https://www.jeju.go.kr/culture/dialect/",
        source_type: "dictionary",
      },
      {
        source_title: "제주어보전회",
        source_url: "https://jejueo.org",
        source_type: "archive",
      },
    ],
    semantic_cluster: "agriculture",
  },
  {
    id: "voc-008",
    headword_native: "할망",
    headword_romanized: "halmang",
    pos: "noun",
    definitions: [
      { language: "en", text: "Grandmother; elderly woman; also used for female deities" },
      { language: "ko", text: "할머니" },
    ],
    example_sentences: [
      {
        target: "할망이 이야기 혜주맨",
        contact: "할머니가 이야기 해주세요",
        english: "Grandmother, please tell us a story",
        source_url: "https://talkingdictionary.swarthmore.edu/jejueo/",
      },
    ],
    audio_url: "https://audio.example.com/halmang.mp3",
    related_terms: ["하르방", "어멍", "아방", "설문대할망"],
    cross_references: [
      {
        source_title: "Jejueo Talking Dictionary",
        source_url: "https://talkingdictionary.swarthmore.edu/jejueo/",
        source_type: "dictionary",
        definition: "Grandmother; elderly woman; a respectful term for any older woman",
        notes: "Audio sample — elder male speaker, recorded 2015",
      },
      {
        source_title: "ELAR Jejueo Collection",
        source_url: "https://elar.soas.ac.uk/Collection/MPI1032013",
        source_type: "archive",
        definition: "Grandmother; also used as a title for female deities in Jeju shamanic tradition (e.g. 설문대할망)",
        notes: "Appears in 12 mythological narratives in the ELAR collection",
      },
      {
        source_title: "Wikipedia — 제주어",
        source_url: "https://ko.wikipedia.org/wiki/제주어",
        source_type: "wiki",
        definition: "할머니 (grandmother); in Jeju mythology, a divine feminine figure — 설문대할망 is the creator goddess of Jeju Island",
        notes: "Dual secular/sacred usage distinguishes Jejueo from Standard Korean 할머니",
      },
    ],
    semantic_cluster: "kinship",
  },
];

// ---------------------------------------------------------------------------
// Mock stats for the dashboard header
// ---------------------------------------------------------------------------

export const MOCK_STATS: LanguageStats = {
  total_entries: 4214,
  total_sources: 10,
  total_audio_clips: 266,
  grammar_patterns: 58,
  coverage_percentage: 21.1,
  sources_by_type: {
    dictionary: 3,
    academic: 1,
    video: 1,
    archive: 3,
    wiki: 2,
  },
};

// ---------------------------------------------------------------------------
// Mock graph data for knowledge graph visualization
// ---------------------------------------------------------------------------

export const MOCK_GRAPH_DATA: GraphData = {
  nodes: [
    // Maritime cluster
    { id: "g-001", headword: "바당", romanization: "badang", cluster: "maritime", sourceCount: 4, definition: "The sea; ocean", degree: 5 },
    { id: "g-002", headword: "해녀", romanization: "haenyeo", cluster: "maritime", sourceCount: 5, definition: "Female diver of Jeju", degree: 5 },
    { id: "g-003", headword: "갯것", romanization: "gaetgeot", cluster: "maritime", sourceCount: 3, definition: "Seafood; things from the sea", degree: 4 },
    { id: "g-004", headword: "물질", romanization: "muljil", cluster: "maritime", sourceCount: 4, definition: "Diving work done by haenyeo", degree: 5 },
    { id: "g-005", headword: "물", romanization: "mul", cluster: "maritime", sourceCount: 2, definition: "Water", degree: 2 },
    { id: "g-006", headword: "테왁", romanization: "tewak", cluster: "maritime", sourceCount: 2, definition: "Gourd float used by haenyeo", degree: 2 },
    { id: "g-007", headword: "빌레", romanization: "bille", cluster: "maritime", sourceCount: 1, definition: "Flat rocks by the shore", degree: 2 },
    { id: "g-008", headword: "바름", romanization: "bareum", cluster: "maritime", sourceCount: 1, definition: "Wind", degree: 1 },
    // Kinship cluster
    { id: "g-009", headword: "하르방", romanization: "hareubang", cluster: "kinship", sourceCount: 3, definition: "Grandfather", degree: 4 },
    { id: "g-010", headword: "할망", romanization: "halmang", cluster: "kinship", sourceCount: 3, definition: "Grandmother", degree: 4 },
    { id: "g-011", headword: "아방", romanization: "abang", cluster: "kinship", sourceCount: 2, definition: "Father", degree: 3 },
    { id: "g-012", headword: "어멍", romanization: "eomeong", cluster: "kinship", sourceCount: 2, definition: "Mother", degree: 3 },
    { id: "g-013", headword: "삼촌", romanization: "samchon", cluster: "kinship", sourceCount: 1, definition: "Uncle; term of address for men", degree: 1 },
    { id: "g-014", headword: "설문대할망", romanization: "seolmundae-halmang", cluster: "kinship", sourceCount: 2, definition: "Legendary giantess goddess of Jeju", degree: 1 },
    // Agriculture cluster
    { id: "g-015", headword: "밧", romanization: "bat", cluster: "agriculture", sourceCount: 2, definition: "Field; dry farmland", degree: 5 },
    { id: "g-016", headword: "보리", romanization: "bori", cluster: "agriculture", sourceCount: 1, definition: "Barley", degree: 3 },
    { id: "g-017", headword: "콩", romanization: "kong", cluster: "agriculture", sourceCount: 1, definition: "Beans; soybeans", degree: 2 },
    { id: "g-018", headword: "조", romanization: "jo", cluster: "agriculture", sourceCount: 1, definition: "Millet", degree: 2 },
    { id: "g-019", headword: "낭", romanization: "nang", cluster: "agriculture", sourceCount: 1, definition: "Tree", degree: 1 },
    // Daily-life cluster
    { id: "g-020", headword: "먹다", romanization: "meokda", cluster: "daily-life", sourceCount: 3, definition: "To eat", degree: 2 },
    { id: "g-021", headword: "집", romanization: "jip", cluster: "daily-life", sourceCount: 2, definition: "House; home", degree: 1 },
    { id: "g-022", headword: "밥", romanization: "bap", cluster: "daily-life", sourceCount: 2, definition: "Cooked rice; meal", degree: 2 },
  ],
  edges: [
    // Maritime connections
    { source: "g-001", target: "g-005", weight: 0.9, type: "related_term" },
    { source: "g-001", target: "g-003", weight: 0.85, type: "related_term" },
    { source: "g-001", target: "g-008", weight: 0.5, type: "embedding" },
    { source: "g-001", target: "g-002", weight: 0.7, type: "related_term" },
    { source: "g-002", target: "g-003", weight: 0.6, type: "embedding" },
    { source: "g-002", target: "g-004", weight: 0.95, type: "related_term" },
    { source: "g-002", target: "g-006", weight: 0.8, type: "related_term" },
    { source: "g-002", target: "g-007", weight: 0.4, type: "cluster" },
    { source: "g-003", target: "g-005", weight: 0.6, type: "embedding" },
    { source: "g-004", target: "g-006", weight: 0.75, type: "related_term" },
    { source: "g-004", target: "g-003", weight: 0.5, type: "related_term" },
    { source: "g-004", target: "g-007", weight: 0.55, type: "cluster" },
    { source: "g-004", target: "g-001", weight: 0.65, type: "embedding" },
    // Kinship connections
    { source: "g-009", target: "g-010", weight: 0.95, type: "related_term" },
    { source: "g-009", target: "g-011", weight: 0.7, type: "related_term" },
    { source: "g-009", target: "g-012", weight: 0.65, type: "related_term" },
    { source: "g-009", target: "g-013", weight: 0.4, type: "cluster" },
    { source: "g-010", target: "g-012", weight: 0.7, type: "related_term" },
    { source: "g-010", target: "g-011", weight: 0.65, type: "embedding" },
    { source: "g-010", target: "g-014", weight: 0.8, type: "related_term" },
    { source: "g-011", target: "g-012", weight: 0.9, type: "related_term" },
    // Agriculture connections
    { source: "g-015", target: "g-016", weight: 0.7, type: "related_term" },
    { source: "g-015", target: "g-017", weight: 0.65, type: "related_term" },
    { source: "g-015", target: "g-018", weight: 0.6, type: "related_term" },
    { source: "g-015", target: "g-019", weight: 0.45, type: "cluster" },
    { source: "g-016", target: "g-017", weight: 0.5, type: "embedding" },
    { source: "g-016", target: "g-018", weight: 0.55, type: "embedding" },
    // Daily-life connections
    { source: "g-020", target: "g-022", weight: 0.8, type: "related_term" },
    { source: "g-021", target: "g-022", weight: 0.5, type: "cluster" },
    // Cross-cluster connections (weaker)
    { source: "g-003", target: "g-020", weight: 0.3, type: "embedding" },
    { source: "g-001", target: "g-015", weight: 0.2, type: "embedding" },
    { source: "g-010", target: "g-014", weight: 0.8, type: "related_term" },
  ],
};
