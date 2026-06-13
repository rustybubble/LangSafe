import { config } from "dotenv";
config({ path: ".env.local" });

import { bulkIndex, search } from "../lib/elastic";
import type { VocabularyEntry } from "../lib/types";

// ---------------------------------------------------------------------------
// Hand-verified Jeju (Jejueo / 제주어) vocabulary entries
// Organized by semantic cluster for rich demo search results
// ---------------------------------------------------------------------------

const DICT_REF = {
  source_title: "Jeju Provincial Dictionary",
  source_url: "https://jejueo-dictionary.kr",
  source_type: "dictionary",
};

const UH_REF = {
  source_title: "UH Mānoa Jejueo Dictionary",
  source_url: "https://sites.google.com/a/hawaii.edu/jejueo",
  source_type: "dictionary",
};

const TALKING_DICT_REF = {
  source_title: "Jejueo Talking Dictionary",
  source_url: "https://talkingdictionary.swarthmore.edu/jejueo",
  source_type: "dictionary",
};

let id = 0;
function nextId(): string {
  return `core-${String(++id).padStart(3, "0")}`;
}

function entry(
  headword_native: string,
  headword_romanized: string,
  pos: string,
  en: string,
  ko: string,
  cluster: string,
  opts: {
    example?: { target: string; contact: string; english: string };
    related?: string[];
    cultural_context?: string;
    refs?: typeof DICT_REF[];
  } = {}
): VocabularyEntry {
  return {
    id: nextId(),
    headword_native,
    headword_romanized,
    pos,
    definitions: [
      { language: "en" as const, text: en },
      { language: "ko" as const, text: ko },
    ],
    example_sentences: opts.example
      ? [{ ...opts.example, source_url: DICT_REF.source_url }]
      : [],
    related_terms: opts.related ?? [],
    cross_references: opts.refs ?? [DICT_REF],
    semantic_cluster: cluster,
  };
}

// ---------------------------------------------------------------------------
// MARITIME (바당 cluster) — Jeju's identity is the sea
// ---------------------------------------------------------------------------
const MARITIME: VocabularyEntry[] = [
  entry("바당", "badang", "noun", "sea, ocean", "바다", "maritime", {
    example: { target: "바당이 곱다", contact: "바다가 아름답다", english: "The sea is beautiful" },
    related: ["물", "갯것", "바름", "해녀"],
    refs: [DICT_REF, TALKING_DICT_REF],
  }),
  entry("갯것", "gaetgeot", "noun", "seafood; things from the sea", "해산물", "maritime", {
    example: { target: "갯것 잡으렌 바당에 가크라", contact: "해산물 잡으러 바다에 가겠다", english: "I will go to the sea to catch seafood" },
    related: ["바당", "해녀", "물질"],
  }),
  entry("해녀", "haenyeo", "noun", "female free-diver; iconic Jeju women divers", "해녀", "maritime", {
    example: { target: "해녀들이 물질헹 갯것 잡앙 온다", contact: "해녀들이 물질해서 해산물 잡아 온다", english: "The haenyeo dive and bring back seafood" },
    related: ["물질", "바당", "갯것", "테왁"],
    cultural_context: "Haenyeo are Jeju's iconic female free-divers, recognized by UNESCO as Intangible Cultural Heritage. They dive without oxygen tanks to harvest seafood.",
    refs: [DICT_REF, UH_REF, TALKING_DICT_REF],
  }),
  entry("물질", "muljil", "noun", "sea diving (the act of diving for seafood)", "물질 (해산물 채취를 위한 잠수)", "maritime", {
    example: { target: "오늘 물질 가게마씸", contact: "오늘 물질 가겠습니다", english: "I will go diving today" },
    related: ["해녀", "바당", "갯것"],
  }),
  entry("테왁", "tewak", "noun", "gourd float used by haenyeo while diving", "테왁 (해녀가 사용하는 부표)", "maritime", {
    example: { target: "해녀가 테왁 들멍 바당에 들어간다", contact: "해녀가 테왁을 들고 바다에 들어간다", english: "The haenyeo enters the sea holding her tewak float" },
    related: ["해녀", "물질", "바당"],
  }),
  entry("졸멩이", "jolmengi", "noun", "abalone", "전복", "maritime", {
    example: { target: "졸멩이 멕여 불라", contact: "전복 좀 먹어 봐라", english: "Try some abalone" },
    related: ["갯것", "해녀", "소라"],
  }),
  entry("소라", "sora", "noun", "turban shell; sea snail", "소라", "maritime", {
    example: { target: "소라 구워 먹으멍 맛좋다", contact: "소라 구워 먹으면 맛있다", english: "Grilled turban shell tastes delicious" },
    related: ["갯것", "졸멩이", "바당"],
  }),
  entry("배", "bae", "noun", "boat, ship", "배", "maritime", {
    example: { target: "배 타멍 고기 잡으렌 간다", contact: "배 타고 고기 잡으러 간다", english: "Going fishing by boat" },
    related: ["바당", "고기"],
  }),
  entry("바름", "bareum", "noun", "wind", "바람", "maritime", {
    example: { target: "바름이 세다", contact: "바람이 세다", english: "The wind is strong" },
    related: ["바당", "날씨"],
  }),
  entry("물", "mul", "noun", "water", "물", "maritime", {
    example: { target: "물 먹엉 가라", contact: "물 마시고 가라", english: "Drink some water before you go" },
    related: ["바당", "샘물"],
  }),
];

// ---------------------------------------------------------------------------
// FAMILY (가족 cluster)
// ---------------------------------------------------------------------------
const FAMILY: VocabularyEntry[] = [
  entry("하르방", "harubang", "noun", "grandfather; also the famous stone statues of Jeju", "할아버지", "family", {
    example: { target: "우리 하르방 집이 어디우꽈?", contact: "우리 할아버지 집이 어디입니까?", english: "Where is our grandfather's house?" },
    related: ["할망", "아방", "어멍"],
    cultural_context: "돌하르방 (dol-harubang) are the iconic stone grandfather statues found across Jeju Island.",
    refs: [DICT_REF, UH_REF],
  }),
  entry("할망", "halmang", "noun", "grandmother", "할머니", "family", {
    example: { target: "할망이 밥 지엉 준다", contact: "할머니가 밥 지어 준다", english: "Grandmother cooks rice for us" },
    related: ["하르방", "어멍", "아방"],
  }),
  entry("아방", "abang", "noun", "father", "아버지", "family", {
    example: { target: "아방이 밧디 갔다", contact: "아버지가 밭에 갔다", english: "Father went to the field" },
    related: ["어멍", "하르방", "할망"],
  }),
  entry("어멍", "eomeong", "noun", "mother", "어머니", "family", {
    example: { target: "어멍이 밥 먹으라 헌다", contact: "어머니가 밥 먹으라 한다", english: "Mother says to come eat" },
    related: ["아방", "할망", "하르방"],
  }),
  entry("아이", "ai", "noun", "child", "아이", "family", {
    example: { target: "아이가 놀멍 잇다", contact: "아이가 놀고 있다", english: "The child is playing" },
    related: ["아들", "딸"],
  }),
  entry("아들", "adeul", "noun", "son", "아들", "family", {
    example: { target: "아들이 서울 갔다", contact: "아들이 서울 갔다", english: "The son went to Seoul" },
    related: ["딸", "아이"],
  }),
  entry("딸", "ttal", "noun", "daughter", "딸", "family", {
    example: { target: "딸이 해녀 된다", contact: "딸이 해녀가 된다", english: "The daughter becomes a haenyeo" },
    related: ["아들", "아이"],
  }),
  entry("성님", "seongnim", "noun", "older sibling (respectful)", "형/언니 (존칭)", "family", {
    example: { target: "성님 어디 감수가?", contact: "형/언니 어디 가세요?", english: "Where are you going, older sibling?" },
    related: ["동생"],
  }),
  entry("동생", "dongsaeng", "noun", "younger sibling", "동생", "family", {
    example: { target: "동생이 학교 간다", contact: "동생이 학교 간다", english: "Younger sibling goes to school" },
    related: ["성님"],
  }),
  entry("식게", "sikge", "noun", "family, household", "식구, 가족", "family", {
    example: { target: "식게가 멕이다", contact: "식구가 많다", english: "The family is large" },
    related: ["하르방", "할망", "아방", "어멍"],
  }),
];

// ---------------------------------------------------------------------------
// GREETINGS & EXPRESSIONS (인사 cluster)
// ---------------------------------------------------------------------------
const GREETINGS: VocabularyEntry[] = [
  entry("안녕하우꽈?", "annyeonghaukwa", "phrase", "hello; how are you? (Jeju greeting)", "안녕하세요?", "greetings", {
    example: { target: "안녕하우꽈? 잘 이시우꽈?", contact: "안녕하세요? 잘 지내세요?", english: "Hello! How have you been?" },
    related: ["혼저옵서예", "잘 이시우꽈?"],
  }),
  entry("혼저옵서예", "honjeookseoye", "phrase", "welcome; please come in (Jeju welcome)", "어서 오세요", "greetings", {
    example: { target: "제주에 혼저옵서예!", contact: "제주에 어서 오세요!", english: "Welcome to Jeju!" },
    related: ["안녕하우꽈?"],
    cultural_context: "The iconic Jeju welcome greeting, seen on signs across the island.",
  }),
  entry("잘 이시우꽈?", "jal isiukwa", "phrase", "how are you? have you been well?", "잘 지내세요?", "greetings", {
    example: { target: "하르방, 잘 이시우꽈?", contact: "할아버지, 잘 지내세요?", english: "Grandfather, how have you been?" },
    related: ["안녕하우꽈?"],
  }),
  entry("고맙수다", "gomapsuda", "phrase", "thank you", "고맙습니다", "greetings", {
    example: { target: "도와줘서 고맙수다", contact: "도와줘서 고맙습니다", english: "Thank you for helping" },
    related: ["고맙다"],
  }),
  entry("어서옵서", "eoseoopseo", "phrase", "welcome; come in", "어서 오세요", "greetings", {
    example: { target: "식게 어서옵서!", contact: "가족 어서 오세요!", english: "Welcome, family!" },
    related: ["혼저옵서예"],
  }),
  entry("녜", "nye", "interjection", "yes", "네", "greetings", {
    example: { target: "녜, 알앙 잇수다", contact: "네, 알고 있습니다", english: "Yes, I know" },
    related: ["아니"],
  }),
  entry("아니", "ani", "interjection", "no", "아니요", "greetings", {
    example: { target: "아니, 그건 아니우다", contact: "아니요, 그건 아닙니다", english: "No, that's not right" },
    related: ["녜"],
  }),
  entry("메꼬름", "mekkorum", "phrase", "goodbye (to someone leaving)", "안녕히 가세요", "greetings", {
    related: ["안녕하우꽈?"],
  }),
  entry("잘 감수다", "jal gamsuda", "phrase", "goodbye; I'm leaving now (said by the one departing)", "잘 가겠습니다", "greetings", {
    example: { target: "잘 감수다, 성님!", contact: "잘 가겠습니다, 형!", english: "Goodbye, I'm off now!" },
    related: ["메꼬름"],
  }),
  entry("경 헵서", "gyeong hepseo", "phrase", "please do so; go ahead", "그렇게 하세요", "greetings", {
    example: { target: "경 헵서, 걱정 맙서", contact: "그렇게 하세요, 걱정 마세요", english: "Go ahead, don't worry" },
  }),
];

// ---------------------------------------------------------------------------
// FOOD (음식 cluster)
// ---------------------------------------------------------------------------
const FOOD: VocabularyEntry[] = [
  entry("먹다", "meokda", "verb", "to eat, to consume", "먹다", "food", {
    example: { target: "밥 먹엉 가라", contact: "밥 먹고 가라", english: "Eat your meal before you go" },
    related: ["밥", "마시다"],
    refs: [DICT_REF, TALKING_DICT_REF],
  }),
  entry("밥", "bap", "noun", "rice; meal", "밥", "food", {
    example: { target: "밥 먹읍서", contact: "밥 드세요", english: "Please eat (your meal)" },
    related: ["먹다", "보리밥"],
  }),
  entry("보리밥", "boribap", "noun", "barley rice (traditional Jeju staple)", "보리밥", "food", {
    example: { target: "보리밥이 맛좋다", contact: "보리밥이 맛있다", english: "Barley rice is delicious" },
    related: ["밥", "먹다"],
    cultural_context: "Barley rice was the staple food of Jeju Island due to the volcanic soil being unsuitable for wet rice cultivation.",
  }),
  entry("빙떡", "bingddeok", "noun", "buckwheat crepe filled with radish (Jeju specialty)", "빙떡 (메밀 전병)", "food", {
    example: { target: "빙떡 멕여 불라", contact: "빙떡 좀 먹어 봐라", english: "Try some buckwheat crepe" },
    related: ["먹다", "메밀"],
    cultural_context: "A traditional Jeju dish — thin buckwheat crepes rolled with seasoned radish.",
  }),
  entry("돔베고기", "dombegogi", "noun", "boiled pork slices (Jeju delicacy)", "돔베고기 (수육)", "food", {
    example: { target: "돔베고기 썰엉 먹자", contact: "돔베고기 썰어서 먹자", english: "Let's slice and eat the boiled pork" },
    related: ["먹다", "돗고기"],
    cultural_context: "Jeju-style boiled pork, sliced on a wooden cutting board. A must-have at Jeju feasts and ancestral rites.",
  }),
  entry("돗고기", "dotgogi", "noun", "pork (Jeju dialect for pig meat)", "돼지고기", "food", {
    example: { target: "돗고기 구워 먹자", contact: "돼지고기 구워 먹자", english: "Let's grill some pork" },
    related: ["돔베고기", "먹다"],
  }),
  entry("마시다", "masida", "verb", "to drink", "마시다", "food", {
    example: { target: "술 마시멍 놀자", contact: "술 마시면서 놀자", english: "Let's drink and have fun" },
    related: ["먹다", "물"],
  }),
  entry("감저", "gamjeo", "noun", "sweet potato", "고구마", "food", {
    example: { target: "감저 구워 먹엉 맛좋다", contact: "고구마 구워 먹으면 맛있다", english: "Roasted sweet potatoes are delicious" },
    related: ["먹다"],
  }),
  entry("전복죽", "jeonbokjuk", "noun", "abalone porridge (Jeju specialty)", "전복죽", "food", {
    example: { target: "전복죽 끓여 먹읍서", contact: "전복죽 끓여 드세요", english: "Please have some abalone porridge" },
    related: ["졸멩이", "먹다"],
    cultural_context: "Abalone porridge is Jeju's signature dish, made with fresh abalone harvested by haenyeo.",
  }),
  entry("메밀", "memil", "noun", "buckwheat", "메밀", "food", {
    example: { target: "메밀로 빙떡 헌다", contact: "메밀로 빙떡 만든다", english: "Making buckwheat crepes with buckwheat" },
    related: ["빙떡"],
  }),
];

// ---------------------------------------------------------------------------
// WEATHER (날씨 cluster)
// ---------------------------------------------------------------------------
const WEATHER: VocabularyEntry[] = [
  entry("눈", "nun", "noun", "snow", "눈", "weather", {
    example: { target: "한라산에 눈 온다", contact: "한라산에 눈 온다", english: "It's snowing on Hallasan" },
    related: ["비", "바름"],
  }),
  entry("비", "bi", "noun", "rain", "비", "weather", {
    example: { target: "비 옵데다", contact: "비가 옵니다", english: "It's raining" },
    related: ["눈", "바름"],
  }),
  entry("구름", "gureum", "noun", "cloud", "구름", "weather", {
    example: { target: "구름이 멕이다", contact: "구름이 많다", english: "There are many clouds" },
    related: ["비", "하늘"],
  }),
  entry("더웁다", "deoupda", "adjective", "hot (weather)", "덥다", "weather", {
    example: { target: "오늘 너무 더웁다", contact: "오늘 너무 덥다", english: "It's very hot today" },
    related: ["치웁다"],
  }),
  entry("치웁다", "chiupda", "adjective", "cold (weather)", "춥다", "weather", {
    example: { target: "바름 불멍 치웁다", contact: "바람 불면서 춥다", english: "It's cold with the wind blowing" },
    related: ["더웁다", "바름"],
  }),
  entry("하늘", "haneul", "noun", "sky", "하늘", "weather", {
    example: { target: "하늘이 맑다", contact: "하늘이 맑다", english: "The sky is clear" },
    related: ["구름", "눈", "비"],
  }),
  entry("안개", "angae", "noun", "fog, mist", "안개", "weather", {
    example: { target: "한라산에 안개 꼈다", contact: "한라산에 안개가 꼈다", english: "Fog has settled on Hallasan" },
    related: ["구름", "바름"],
  }),
  entry("노을", "noeul", "noun", "sunset glow", "노을", "weather", {
    example: { target: "바당 우의 노을이 곱다", contact: "바다 위의 노을이 아름답다", english: "The sunset over the sea is beautiful" },
    related: ["하늘", "바당"],
  }),
];

// ---------------------------------------------------------------------------
// NATURE & GEOGRAPHY (자연 cluster)
// ---------------------------------------------------------------------------
const NATURE: VocabularyEntry[] = [
  entry("오름", "oreum", "noun", "parasitic cone; small volcanic hill (unique to Jeju)", "오름 (기생 화산)", "nature", {
    example: { target: "오름에 올라가멍 경치가 좋다", contact: "오름에 올라가면 경치가 좋다", english: "The view is great when you climb the oreum" },
    related: ["한라산", "곶자왈"],
    cultural_context: "Jeju has over 360 oreums (parasitic volcanic cones). They are a defining feature of the island's landscape.",
    refs: [DICT_REF, UH_REF],
  }),
  entry("한라산", "hallasan", "noun", "Hallasan; the central mountain of Jeju (1,947m)", "한라산", "nature", {
    example: { target: "한라산이 제주 가운데 잇다", contact: "한라산이 제주 가운데 있다", english: "Hallasan is in the center of Jeju" },
    related: ["오름"],
    cultural_context: "South Korea's highest peak, a shield volcano that forms the center of Jeju Island.",
  }),
  entry("곶자왈", "gotjawal", "noun", "lava forest; unique Jeju ecosystem of tangled vegetation on lava rock", "곶자왈", "nature", {
    example: { target: "곶자왈에 들어가멍 서늘하다", contact: "곶자왈에 들어가면 서늘하다", english: "It's cool when you enter the gotjawal forest" },
    related: ["오름", "돌"],
    cultural_context: "Gotjawal are globally rare ecosystems found only on Jeju — forests growing on uneven lava terrain that serve as the island's natural aquifer.",
  }),
  entry("돌", "dol", "noun", "stone, rock (Jeju is famously rocky)", "돌", "nature", {
    example: { target: "제주는 돌이 멕이다", contact: "제주는 돌이 많다", english: "Jeju has many rocks" },
    related: ["하르방", "밧담"],
    cultural_context: "Jeju is known as the island of three abundances: wind, rocks, and women (삼다도).",
  }),
  entry("밧담", "batdam", "noun", "stone wall surrounding fields (Jeju agricultural walls)", "밭담", "nature", {
    example: { target: "밧담이 밧디를 막아준다", contact: "밭담이 밭을 보호해준다", english: "The stone wall protects the field" },
    related: ["돌", "밧디"],
    cultural_context: "Jeju's agricultural stone walls (밭담) total over 22,000 km and are a FAO-recognized Globally Important Agricultural Heritage System.",
  }),
  entry("밧디", "batdi", "noun", "field, farmland", "밭", "nature", {
    example: { target: "밧디 갈멍 일헌다", contact: "밭에 가서 일한다", english: "Going to the field to work" },
    related: ["밧담", "감저"],
  }),
  entry("낭", "nang", "noun", "tree", "나무", "nature", {
    example: { target: "큰 낭 아래 쉬어가라", contact: "큰 나무 아래 쉬어가라", english: "Rest under the big tree" },
    related: ["곶자왈"],
  }),
  entry("꽃", "kkot", "noun", "flower", "꽃", "nature", {
    example: { target: "유채꽃이 핀다", contact: "유채꽃이 핀다", english: "The canola flowers are blooming" },
    related: ["낭"],
  }),
];

// ---------------------------------------------------------------------------
// DAILY LIFE (일상 cluster)
// ---------------------------------------------------------------------------
const DAILY_LIFE: VocabularyEntry[] = [
  entry("가다", "gada", "verb", "to go", "가다", "daily-life", {
    example: { target: "어디 감수과?", contact: "어디 가세요?", english: "Where are you going?" },
    related: ["오다", "걷다"],
  }),
  entry("오다", "oda", "verb", "to come", "오다", "daily-life", {
    example: { target: "이디 옵서", contact: "여기 오세요", english: "Come here" },
    related: ["가다"],
  }),
  entry("하다", "hada", "verb", "to do", "하다", "daily-life", {
    example: { target: "무신거 하멍 이서?", contact: "무엇을 하고 있어?", english: "What are you doing?" },
    related: ["일하다"],
  }),
  entry("보다", "boda", "verb", "to see, to look", "보다", "daily-life", {
    example: { target: "이거 봅서", contact: "이것 보세요", english: "Look at this" },
  }),
  entry("알다", "alda", "verb", "to know", "알다", "daily-life", {
    example: { target: "나도 알앙 잇다", contact: "나도 알고 있다", english: "I know too" },
  }),
  entry("집", "jip", "noun", "house, home", "집", "daily-life", {
    example: { target: "집이 가게마씸", contact: "집에 가겠습니다", english: "I'll go home" },
    related: ["식게"],
  }),
  entry("일", "il", "noun", "work, task", "일", "daily-life", {
    example: { target: "오늘 일이 멕이다", contact: "오늘 일이 많다", english: "There's a lot of work today" },
    related: ["하다"],
  }),
  entry("놀다", "nolda", "verb", "to play, to have fun", "놀다", "daily-life", {
    example: { target: "아이들이 놀멍 잇다", contact: "아이들이 놀고 있다", english: "The children are playing" },
    related: ["아이"],
  }),
  entry("좋다", "jota", "adjective", "good, nice", "좋다", "daily-life", {
    example: { target: "오늘 날씨가 좋다", contact: "오늘 날씨가 좋다", english: "The weather is nice today" },
    related: ["곱다"],
  }),
  entry("곱다", "gopda", "adjective", "beautiful, pretty", "곱다, 아름답다", "daily-life", {
    example: { target: "제주 바당이 곱다", contact: "제주 바다가 아름답다", english: "Jeju's sea is beautiful" },
    related: ["좋다"],
  }),
];

// ---------------------------------------------------------------------------
// NUMBERS (숫자 cluster)
// ---------------------------------------------------------------------------
const NUMBERS: VocabularyEntry[] = [
  entry("하나", "hana", "numeral", "one", "하나", "numbers", { related: ["둘", "셋"] }),
  entry("둘", "dul", "numeral", "two", "둘", "numbers", { related: ["하나", "셋"] }),
  entry("셋", "set", "numeral", "three", "셋", "numbers", { related: ["둘", "넷"] }),
  entry("넷", "net", "numeral", "four", "넷", "numbers", { related: ["셋", "다섯"] }),
  entry("다섯", "daseot", "numeral", "five", "다섯", "numbers", { related: ["넷", "여섯"] }),
  entry("여섯", "yeoseot", "numeral", "six", "여섯", "numbers", { related: ["다섯", "일곱"] }),
  entry("일곱", "ilgop", "numeral", "seven", "일곱", "numbers", { related: ["여섯", "여덟"] }),
  entry("여덟", "yeodeol", "numeral", "eight", "여덟", "numbers", { related: ["일곱", "아홉"] }),
  entry("아홉", "ahop", "numeral", "nine", "아홉", "numbers", { related: ["여덟", "열"] }),
  entry("열", "yeol", "numeral", "ten", "열", "numbers", { related: ["아홉"] }),
];

// ---------------------------------------------------------------------------
// ANIMALS (동물 cluster)
// ---------------------------------------------------------------------------
const ANIMALS: VocabularyEntry[] = [
  entry("몰", "mol", "noun", "horse (Jeju pony)", "말", "animals", {
    example: { target: "몰이 오름에서 풀 먹다", contact: "말이 오름에서 풀을 먹는다", english: "The horse grazes on the oreum" },
    related: ["조랑말"],
    cultural_context: "Jeju ponies (조랑말) are a native breed, smaller than mainland horses, historically vital to the island's economy.",
  }),
  entry("강생이", "gangsaengi", "noun", "puppy, dog", "강아지, 개", "animals", {
    example: { target: "강생이가 짖는다", contact: "강아지가 짖는다", english: "The dog is barking" },
  }),
  entry("고냥이", "gonyangi", "noun", "cat", "고양이", "animals", {
    example: { target: "고냥이가 생선 먹다", contact: "고양이가 생선 먹는다", english: "The cat is eating fish" },
  }),
  entry("돗", "dot", "noun", "pig", "돼지", "animals", {
    example: { target: "돗 키우멍 살다", contact: "돼지 키우면서 살다", english: "Living while raising pigs" },
    related: ["돗고기"],
    cultural_context: "Pigs have been central to Jeju culture. The traditional Jeju toilet (통시) was connected to the pigpen.",
  }),
  entry("새", "sae", "noun", "bird", "새", "animals", {
    example: { target: "새가 낭 우의 앉앙 잇다", contact: "새가 나무 위에 앉아 있다", english: "A bird is sitting in the tree" },
    related: ["낭"],
  }),
];

// ---------------------------------------------------------------------------
// COLORS (색깔 cluster)
// ---------------------------------------------------------------------------
const COLORS: VocabularyEntry[] = [
  entry("빨강", "ppalgang", "noun", "red", "빨간색", "colors"),
  entry("파랑", "parang", "noun", "blue", "파란색", "colors"),
  entry("노랑", "norang", "noun", "yellow", "노란색", "colors"),
  entry("희다", "huida", "adjective", "white", "하얗다, 흰색", "colors", {
    example: { target: "눈이 와서 온 세상이 희다", contact: "눈이 와서 온 세상이 하얗다", english: "The whole world is white from the snow" },
  }),
  entry("검다", "geomda", "adjective", "black", "검다, 검은색", "colors", {
    example: { target: "현무암이 검다", contact: "현무암이 검다", english: "The basalt is black" },
    cultural_context: "Jeju's volcanic basalt rock is characteristically black, seen in walls, buildings, and the famous stone statues.",
  }),
];

// ---------------------------------------------------------------------------
// Combine all entries and seed
// ---------------------------------------------------------------------------

const ALL_ENTRIES: VocabularyEntry[] = [
  ...MARITIME,
  ...FAMILY,
  ...GREETINGS,
  ...FOOD,
  ...WEATHER,
  ...NATURE,
  ...DAILY_LIFE,
  ...NUMBERS,
  ...ANIMALS,
  ...COLORS,
];

async function main() {
  console.log(`🌺 LangSafe Core Preseed`);
  console.log(`   ${ALL_ENTRIES.length} hand-verified Jejueo vocabulary entries`);
  console.log(`   Clusters: maritime, family, greetings, food, weather, nature, daily-life, numbers, animals, colors`);
  console.log();

  console.log(`📡 Generating JINA embeddings and indexing to Elasticsearch...`);
  const result = await bulkIndex(ALL_ENTRIES, "jje");

  console.log(`✅ Indexed ${result.indexed}/${ALL_ENTRIES.length} entries`);
  console.log();

  // Quick verification search
  console.log(`🔍 Verification search for "바당" (sea)...`);
  const { entries: results } = await search("바당", { limit: 3 });
  for (const r of results) {
    const enDef = r.definitions.find((d: { language: string; text: string }) => d.language === "en")?.text ?? "";
    console.log(`   ${r.headword_native} (${r.headword_romanized}) — ${enDef}`);
  }

  console.log();
  console.log(`🔍 Cross-lingual search for "grandfather"...`);
  const { entries: results2 } = await search("grandfather", { limit: 3 });
  for (const r of results2) {
    const enDef = r.definitions.find((d: { language: string; text: string }) => d.language === "en")?.text ?? "";
    console.log(`   ${r.headword_native} (${r.headword_romanized}) — ${enDef}`);
  }

  console.log();
  console.log(`✅ Done! Your Elastic index is ready for demo.`);
}

main().catch((err) => {
  console.error("❌ Preseed failed:", err);
  process.exit(1);
});
