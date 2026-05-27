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
  COMPARISON_PATTERNS,
  DRUG_PROMOTION_PATTERNS,
  EXAGGERATED_EFFICACY_PATTERNS,
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

/** v1 임계점. 운영 데이터 보고 조정. */
const FLAG_THRESHOLD = 5;

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
