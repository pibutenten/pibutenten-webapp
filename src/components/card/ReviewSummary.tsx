/**
 * ReviewSummary — 시술후기 카드(type=review)의 정량 요약 한 줄 텍스트.
 *
 * 카드 제목 바로 아래(CardBody afterTitle 슬롯)에 박스 없이 인라인 텍스트로 표시
 * (원장 승인 표기안, 2026-07-04):
 *   ★★★★☆ · 통증 꽤 · 또 받을래요 · 회복 1~2일 · 효과 탄력·리프팅·모공 +2
 *
 *   - 만족도: 별점만 (라벨 생략, ★×satisfaction 금색 / 나머지 옅은 회색)
 *   - 통증: 흐린 라벨 "통증" + 하늘색 값(1=없음 … 5=심함)
 *   - 재시술 의향: 라벨 접두 없이 값 자체가 뜻 전달(연한 회색 — 전부 하늘색이면 산만, 2차 확정) —
 *     또 받을래요/재시술 고민 중/재시술 생각 없어요. (2026-06-04 제거 → 2026-07-04 원장 확정 복원)
 *   - 회복(다운타임): 라벨 접두 없이 값 자체가 뜻 전달(연한 회색) — 당일 회복/회복 1~2일/…
 *   - 효과 체감: 흐린 라벨 "효과" + effect_areas 값(하늘색) 최대 3개 가운뎃점(·) 연결,
 *     남으면 " +n"(회색)
 *   - 항목 구분: 가운뎃점(·) / 미응답(null·undefined) 항목은 그 자리 생략
 *
 * 색·라벨은 review/new/ReviewForm.tsx 의 PAIN_FACES 와 정합.
 * 디자인 토큰: --primary(하늘색) / --accent-save / --text-secondary / --text-muted.
 */
import type { ReviewSummaryData } from "@/lib/types/card";

/* 통증 값 라벨 — ReviewForm PAIN_FACES 와 동일 순서(1~5). */
const PAIN_LABELS: Record<number, string> = {
  1: "없음",
  2: "조금",
  3: "보통",
  4: "꽤",
  5: "심함",
};

/* 재시술 의향 — procedure_reviews.revisit 슬러그 → 카드 표기(원장 확정 2026-07-04).
 * 라벨 접두 없이 문구 자체가 뜻을 전달. */
const REVISIT_LABELS: Record<string, string> = {
  yes: "또 받을래요",
  maybe: "재시술 고민 중",
  no: "재시술 생각 없어요",
};

/* 회복(다운타임) — 키는 lib/review-options.ts DOWNTIME_OPTIONS 의 value(=DB CHECK 0213 슬러그)와
 * 1:1. 라벨 문구는 폼 라벨("없음"/"1~2일"…)과 다른 카드 전용 표기(원장 확정 2026-07-04) —
 * 카드에선 맥락 없이 읽혀야 해서 "회복"을 문구에 포함. */
const DOWNTIME_CARD_LABELS: Record<string, string> = {
  same_day: "당일 회복",
  days_1_2: "회복 1~2일",
  days_3_5: "회복 3~5일",
  week_1: "회복 약 1주",
  weeks_2_plus: "회복 2주 이상",
};

/* 효과 체감 — 카드 한 줄 길이 유지를 위해 최대 3개까지만 나열, 나머지는 " +n". */
const MAX_EFFECTS = 3;

export default function ReviewSummary({ review }: { review: ReviewSummaryData }) {
  const satisfaction = Math.max(
    0,
    Math.min(5, Math.round(review.satisfaction || 0)),
  );
  const painLabel = PAIN_LABELS[review.pain] ?? null;
  const revisitLabel = review.revisit ? (REVISIT_LABELS[review.revisit] ?? null) : null;
  const downtimeLabel = review.downtime
    ? (DOWNTIME_CARD_LABELS[review.downtime] ?? null)
    : null;
  const effects = (review.effect_areas ?? []).filter(
    (e) => typeof e === "string" && e.trim(),
  );

  // 표시할 세그먼트 모음 — 가운뎃점(·)으로 구분.
  const segments: React.ReactNode[] = [];

  // 만족도 — 별점만 (라벨 생략).
  if (satisfaction > 0) {
    segments.push(
      <span
        key="sat"
        className="whitespace-nowrap"
        aria-label={`만족도 ${satisfaction}점`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            aria-hidden
            style={{ color: n <= satisfaction ? "var(--accent-save)" : "#D7DAE0" }}
          >
            ★
          </span>
        ))}
      </span>,
    );
  }

  // 통증 — 흐린 라벨 + 하늘색 값.
  if (painLabel) {
    segments.push(
      <span key="pain" className="whitespace-nowrap">
        <span className="text-[var(--text-muted)]">통증 </span>
        <span style={{ color: "var(--primary)" }}>{painLabel}</span>
      </span>,
    );
  }

  // 재시술 의향 — 라벨 접두 없이 문구 자체가 값. 연한 회색(원장 확정 2026-07-04 2차 —
  //   통증·효과 값까지 전부 하늘색이면 정신 사나워서 이 두 항목은 톤 다운).
  if (revisitLabel) {
    segments.push(
      <span
        key="revisit"
        className="whitespace-nowrap text-[var(--text-muted)]"
      >
        {revisitLabel}
      </span>,
    );
  }

  // 회복(다운타임) — 라벨 접두 없이 문구 자체가 값. 연한 회색(재시술과 동일 톤 다운).
  if (downtimeLabel) {
    segments.push(
      <span
        key="downtime"
        className="whitespace-nowrap text-[var(--text-muted)]"
      >
        {downtimeLabel}
      </span>,
    );
  }

  // 효과 체감 — 흐린 라벨 + 가운뎃점으로 연결한 하늘색 값(최대 3개, 남으면 +n 회색).
  if (effects.length > 0) {
    const shown = effects.slice(0, MAX_EFFECTS);
    const rest = effects.length - shown.length;
    segments.push(
      <span key="effects">
        <span className="text-[var(--text-muted)]">효과 </span>
        <span style={{ color: "var(--primary)" }}>{shown.join("·")}</span>
        {rest > 0 && (
          <span className="text-[var(--text-muted)]"> +{rest}</span>
        )}
      </span>,
    );
  }

  if (segments.length === 0) return null;

  return (
    <div className="mb-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
      {segments.map((seg, i) => (
        <span key={i}>
          {i > 0 && (
            <span aria-hidden className="mx-1.5 text-[var(--text-muted)]">
              ·
            </span>
          )}
          {seg}
        </span>
      ))}
    </div>
  );
}
