/**
 * 콘텐츠 자동 검수기 v1 (보안 2.5차 E묶음, 2026-05-19)
 *
 * 의료법 제56조 14금지 + 약사법 제68조 + 환자 후기 패턴 키워드 매칭.
 *
 * 정책:
 *   - **의사·관리자 작성: 자동 통과** (이미 면허 검증된 자격).
 *   - 회원(role='user') 작성만 검사.
 *   - 점수 합산. 임계점 이상이면 status='pending_review' 강제 + screening_flags 저장.
 *   - 자동 차단 X — admin 검토 큐로 이동, 24~72h 내 검토.
 *
 * 임계점: **5점** (보수적). v1 운영 1주 데이터 보고 조정.
 *
 * 사용:
 *   const verdict = screenContent({ ... });
 *   if (verdict.flagged) {
 *     status = 'pending_review';
 *     screening_flags = verdict.reasons;
 *   }
 */

import {
  AD_HINTS,
  CLINIC_NAME_PATTERN,
  CLINIC_PREFIX_EXCLUDE,
  COMPARISON_PATTERNS,
  DOCTOR_NAME_PATTERN,
  DOCTOR_PREFIX_EXCLUDE,
  DRUG_PROMOTION_PATTERNS,
  EXAGGERATED_EFFICACY_PATTERNS,
  PAID_SPONSORSHIP_PATTERNS,
  PATIENT_TESTIMONIAL_PATTERNS,
  PRESCRIPTION_DRUG_NAMES,
  PRICE_DISCOUNT_PATTERNS,
  TESTIMONIAL_HINTS,
} from "./content-screening-dict";

export type ScreeningVerdict = {
  /** 임계점 이상이면 true. status 강제 pending_review 권고. */
  flagged: boolean;
  /** 누적 점수 (운영 모니터링용). */
  score: number;
  /** 잡힌 사유 키 — DB screening_flags 컬럼 저장용. */
  reasons: string[];
};

export type ScreeningInput = {
  // P2-4 (2026-05-27): 옛 question/answer alias 폐기, title/body 단일.
  title?: string | null;
  body?: string | null;
  keywords?: string[] | null;
  externalUrl?: string | null;
  /** 작성자 역할 — admin/doctor 는 자동 통과. */
  authorRole: "admin" | "doctor" | "user";
};

/**
 * 검수 임계점.
 *  - v1 (~2026-05-28): 5. 거짓양성 비율이 높다는 운영 피드백 — "어디서 받았어요" 같은 사실 진술도 자주 잡음.
 *  - v2 (배치 ⑤, 2026-05-28~): 7. 단일 카테고리로는 안 걸리고 두 신호 결합 시 잡히는 수준.
 *    동시에 'paid_sponsorship' (+4) 신설 — 약관 ④가 명시 금지한 유형을 단독으로 거의 임계 직전까지 가중.
 */
const FLAG_THRESHOLD = 7;

/**
 * 콘텐츠 검수 — 1회 호출.
 *
 * O(N) where N = 검사 패턴 수 (~40개) × 본문 길이. 본문 max 30KB라 무시 가능 비용.
 */
export function screenContent(input: ScreeningInput): ScreeningVerdict {
  // 의사/관리자 화이트리스트 — 면허 검증된 자격이라 검수 대상 외.
  if (input.authorRole !== "user") {
    return { flagged: false, score: 0, reasons: [] };
  }

  const text = [
    input.title ?? "",
    input.body ?? "",
    (input.keywords ?? []).join(" "),
    input.externalUrl ?? "",
  ].join("\n");

  if (text.trim().length === 0) {
    return { flagged: false, score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. 환자 치료경험담 (의료법 §56②2 — 단속 최다 유형)
  let testimonialHits = 0;
  for (const re of PATIENT_TESTIMONIAL_PATTERNS) {
    if (re.test(text)) testimonialHits++;
  }
  if (testimonialHits >= 2) {
    score += 3;
    reasons.push("patient_testimonial");
  } else if (testimonialHits === 1) {
    // 단독으로는 약한 신호 — 광고 hint 와 결합 시만 가중.
    score += 1;
  }

  // 1-b. 대가성·협찬 후기 (배치 ⑤, 2026-05-28)
  //   약관 ④ "대가(협찬·광고비·체험단 등)를 받은 후기" 단독으로 +4 — 다른 신호 1개와 결합 시 임계 7 도달.
  for (const re of PAID_SPONSORSHIP_PATTERNS) {
    if (re.test(text)) {
      score += 4;
      reasons.push("paid_sponsorship");
      break;
    }
  }

  // 2. 비포·애프터 명시
  for (const hint of TESTIMONIAL_HINTS) {
    if (text.toLowerCase().includes(hint.toLowerCase())) {
      score += 3;
      reasons.push("before_after");
      break;
    }
  }

  // 3. 비교 광고 (§56②4)
  for (const re of COMPARISON_PATTERNS) {
    if (re.test(text)) {
      score += 3;
      reasons.push("comparison_ad");
      break;
    }
  }

  // 4. 과장 효능 / 부작용 누락 (§56②3·7·8)
  for (const re of EXAGGERATED_EFFICACY_PATTERNS) {
    if (re.test(text)) {
      score += 3;
      reasons.push("exaggerated_efficacy");
      break;
    }
  }

  // 5. 비급여 할인 (§56②13)
  for (const re of PRICE_DISCOUNT_PATTERNS) {
    if (re.test(text)) {
      score += 2;
      reasons.push("price_discount");
      break;
    }
  }

  // 6. 광고성 호객 표현 — 가중치 작음, 다른 패턴과 결합 시 의미.
  for (const hint of AD_HINTS) {
    if (text.includes(hint)) {
      score += 1;
      reasons.push("solicitation");
      break;
    }
  }

  // 7. 약사법 §68 일반인 대상 전문의약품 광고
  for (const drug of PRESCRIPTION_DRUG_NAMES) {
    const re = new RegExp(drug, "i");
    if (re.test(text)) {
      score += 3;
      reasons.push("prescription_drug");
      break;
    }
  }
  for (const re of DRUG_PROMOTION_PATTERNS) {
    if (re.test(text)) {
      score += 2;
      reasons.push("drug_promotion");
      break;
    }
  }

  // 8. 외부 URL — 다른 신호와 결합 시 위험(환자 유인).
  if (input.externalUrl && reasons.length > 0) {
    score += 1;
    reasons.push("external_url_with_signal");
  }

  // 중복 제거 + 정렬
  const uniqueReasons = Array.from(new Set(reasons));

  return {
    flagged: score >= FLAG_THRESHOLD,
    score,
    reasons: uniqueReasons,
  };
}

/**
 * 병원·의사명 하드블록 탐지 결과 (P3 시술후기 전용, 2026-06-01).
 *   blocked=true 면 제출 자체를 차단 (점수 합산식 소프트 검수와 별개).
 *   matches: 차단 근거가 된 표현 (사용자 안내용, 최대 10개).
 */
export type ProhibitedMentionResult = { blocked: boolean; matches: string[] };

/**
 * 시술후기 본문에서 특정 병원명·의사명 지목 표현을 탐지.
 *
 * - 접미사(피부과/원장님 등) 앞 고유명 토큰이 일반어(EXCLUDE)면 차단하지 않음.
 * - 전역(g) 정규식 재사용 시 lastIndex 상태 문제를 피하기 위해 matchAll 사용.
 */
export function detectProhibitedMentions(text: string): ProhibitedMentionResult {
  const found = new Set<string>();
  if (text) {
    for (const m of text.matchAll(CLINIC_NAME_PATTERN)) {
      const prefix = (m[1] ?? "").trim();
      if (!CLINIC_PREFIX_EXCLUDE.has(prefix)) found.add(m[0].trim());
    }
    for (const m of text.matchAll(DOCTOR_NAME_PATTERN)) {
      const prefix = (m[1] ?? "").trim();
      if (!DOCTOR_PREFIX_EXCLUDE.has(prefix)) found.add(m[0].trim());
    }
  }
  return { blocked: found.size > 0, matches: Array.from(found).slice(0, 10) };
}
