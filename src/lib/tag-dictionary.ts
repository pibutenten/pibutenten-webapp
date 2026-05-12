/**
 * 피부텐텐 태그 사전 + 정규화 룰.
 *
 * 목적:
 *  1) Step1 LLM이 카드 생성 시 비교적 일관된 키워드를 쓰도록 안내.
 *  2) DB의 기존 카드 태그를 일괄 정리 (붙어있는 두 단어를 분리, 표기 통일).
 *  3) 운영 후 새 카드 발행 시도 클라이언트·서버에서 동일 룰로 정규화.
 *
 * 룰 우선순위:
 *  1) `MAPPINGS` 에 정확 일치하는 raw가 있으면 → 매핑 결과(여러 개일 수 있음).
 *  2) `BLACKLIST` 에 있으면 → 제거.
 *  3) 그 외엔 그대로 통과.
 *
 * 매핑 결과는 배열이라 한 태그가 여러 태그로 쪼개질 수 있음.
 * 빈 배열 = 해당 태그 제거.
 */

/** 한국어 → 표준 한국어/약어로 정규화. 한 raw가 여러 결과로 쪼개질 수도 있음. */
export const TAG_MAPPINGS: Record<string, string[]> = {
  // 사용자 알려준 규칙 (2026-05-12 1차)
  "효과지속": ["지속기간"],
  "5060대": ["50대", "60대"],
  "3040": ["30대", "40대"],
  "3040대": ["30대", "40대"],
  "스마스": ["SMAS"],
  "볼륨선택": ["볼륨"],
  "필러비교": ["필러"],
  "스컬트라결절": ["스컬트라", "결절"],
  "스파출라마사지": ["마사지"],
  "선크림필수": ["선크림"],
  "스킨케어기본": ["스킨케어루틴"],
  "30대스킨케어": ["30대", "스킨케어"],
  "약알칼리성클렌저": ["약알칼리성", "클렌저"],
  "가벼운보습": ["보습"],
  "스킨케어단계": ["스킨케어"],
  "하이푸화상": ["HIFU", "화상"],
  "하이푸": ["HIFU"],
  "결절안전": ["결절"],
  "자연스러운시술": [],
  "고분자저분자": ["고분자", "저분자"],
  "고압산소치료": ["고압산소"],
  "리프팅통증": ["리프팅", "통증"],
  "볼꺼짐방지": ["볼꺼짐"],
  "자외선차단핸드크림": ["자외선차단", "핸드크림"],
  "민감성핸드크림": ["민감성피부", "핸드크림"],
  "경락통증": ["경락", "통증"],
  "경락효과": ["경락"],
  "예민피부주의": ["민감성피부"],
  "예민피부": ["민감성피부"],
  "콜라겐엘라스틴": ["콜라겐", "엘라스틴"],
  "진피재건": ["진피"],
  "콜라겐자극": ["콜라겐"],
  "희석프로토콜": ["희석", "프로토콜"],
  "보톡스효과": ["보톡스", "효과"],

  // 추가 — Step1 v5 시술명/부위/개념 사전 정렬 (한국어 표기 통일용)
  "쥬베룩볼륨": ["쥬베룩", "볼륨"],
  "리쥬란HB": ["리쥬란"],
  "리쥬란아이": ["리쥬란", "눈가"],
};

/** 의미 없거나 데코·과한 표현 — 일괄 제거 */
export const TAG_BLACKLIST: ReadonlySet<string> = new Set([
  "적절한강도",
  "초보주의",
  "보조수단",
]);

/**
 * 한국어 → 영문 PubMed 검색 키워드 사전.
 * Step1 v5 프롬프트의 dictionary와 동일 + 점진적으로 확장.
 *
 * Step1 LLM이 카드 작성 시 이 사전을 참고해 pubmed_search_keywords 영문화.
 * (LLM이 사전에 없는 항목은 자체 의학지식 fallback)
 */
export const PUBMED_KEYWORD_DICT: Record<string, string[]> = {
  // 시술/제품명
  "쥬브젠": ["carboxytherapy hyaluronic acid", "CO2 therapy facial"],
  "힐로웨이브": ["hyaluronic acid skin booster", "non-crosslinked HA microinjection"],
  "리쥬란": ["polynucleotide PN skin", "PDRN dermal"],
  "스컬트라": ["poly-L-lactic acid PLLA facial", "Sculptra"],
  "쥬베룩": ["PDLLA injectable biostimulator"],
  "레디어스": ["calcium hydroxylapatite CaHA filler", "Radiesse"],
  "올리디아": ["polycaprolactone PCL filler"],
  "더엘주사": ["salmon DNA injection", "PDRN polynucleotide"],
  "울쎄라": ["high-intensity focused ultrasound HIFU", "Ulthera"],
  "써마지": ["monopolar radiofrequency face", "Thermage"],
  "티타늄": ["bipolar RF microneedling lifting"],
  "올타이트": ["bipolar radiofrequency face tightening"],
  "온다": ["microwave thermal facial lifting"],
  "인모드": ["bipolar radiofrequency face contouring"],
  "물광주사": ["injectable hyaluronic acid microinjection skin hydration"],
  "보톡스": ["botulinum toxin A facial"],
  "필러": ["hyaluronic acid dermal filler", "HA filler"],
  "스킨부스터": ["skin booster", "biorevitalization"],
  "콜라겐부스터": ["collagen biostimulator", "injectable biostimulator"],
  "레이저토닝": ["low-fluence Q-switched laser melasma"],
  "피코토닝": ["picosecond laser pigmentation"],
  "프락셀": ["fractional laser skin resurfacing"],
  "CO2레이저": ["fractional CO2 laser resurfacing"],
  "HIFU": ["high-intensity focused ultrasound HIFU"],
  "SMAS": ["superficial musculoaponeurotic system"],

  // 부위
  "팔자주름": ["nasolabial fold"],
  "마리오네트주름": ["marionette lines"],
  "눈가주름": ["periorbital wrinkles", "crow's feet"],
  "이마주름": ["forehead wrinkles"],
  "미간주름": ["glabellar lines"],
  "목주름": ["neck wrinkles", "platysmal bands"],
  "입가": ["perioral"],
  "다크서클": ["tear trough", "infraorbital hollow", "periorbital dark circles"],
  "눈밑꺼짐": ["tear trough", "infraorbital hollow"],
  "볼꺼짐": ["midface volume loss"],
  "턱선": ["jawline contour"],
  "모공": ["enlarged facial pores"],
  "기미": ["hyperpigmentation", "melasma"],
  "홍조": ["facial erythema", "rosacea"],
  "여드름흉터": ["acne scar"],

  // 개념
  "콜라겐": ["collagen production", "neocollagenesis"],
  "탄력": ["skin elasticity", "skin firmness"],
  "결절": ["nodule", "granuloma"],
  "부작용": ["adverse effects", "complications"],
  "다운타임": ["downtime", "recovery"],
  "멍": ["bruising", "ecchymosis"],
  "시술후관리": ["post-procedure care"],
  "안전성": ["safety profile"],
  "가교제": ["crosslinking agent"],
  "분자량": ["molecular weight"],
  "섬유아세포": ["fibroblast"],
  "지속기간": ["duration of effect", "longevity"],
  "통증": ["pain perception", "discomfort"],
};

/**
 * 단일 raw 태그 → 정규화된 결과 배열 반환.
 * - MAPPINGS 일치: 매핑 결과 (빈 배열 = 제거)
 * - BLACKLIST 일치: 빈 배열
 * - 그 외: 입력 그대로 1개 배열
 *
 * 추가 정리: 양쪽 공백 trim, # 접두 제거, 빈 문자열 제거.
 */
export function normalizeTag(raw: string): string[] {
  const v = (raw ?? "").trim().replace(/^#/, "");
  if (!v) return [];
  if (TAG_BLACKLIST.has(v)) return [];
  if (v in TAG_MAPPINGS) return TAG_MAPPINGS[v];
  return [v];
}

/**
 * 태그 배열 정규화 — 매핑 적용 + 중복 제거 + 순서 보존.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    for (const norm of normalizeTag(raw)) {
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
  }
  return out;
}
