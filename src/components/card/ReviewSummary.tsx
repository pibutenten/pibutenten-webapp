/**
 * ReviewSummary — 시술후기 카드(type=review)의 정량 요약 한 줄 텍스트.
 *
 * 카드 제목 바로 아래(CardBody afterTitle 슬롯)에 박스 없이 인라인 텍스트로 표시:
 *   ★★★★☆ · 통증 꽤 · 효과 탄력·리프팅
 *
 *   - 만족도: 별점만 (라벨 생략, ★×satisfaction 금색 / 나머지 옅은 회색)
 *   - 통증: 흐린 라벨 "통증" + 하늘색 값(1=없음 … 5=심함)
 *   - 효과 체감: 흐린 라벨 "효과" + effect_areas 값(하늘색)을 가운뎃점(·)으로 연결
 *   - 항목 구분: 가운뎃점(·)
 *   ※ '재시술 의향'은 카드에선 제거(카드 길이 단축, 2026-06-04). 리포트 집계엔 유지.
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

export default function ReviewSummary({ review }: { review: ReviewSummaryData }) {
  const satisfaction = Math.max(
    0,
    Math.min(5, Math.round(review.satisfaction || 0)),
  );
  const painLabel = PAIN_LABELS[review.pain] ?? null;
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

  // 효과 체감 — 흐린 라벨 + 가운뎃점으로 연결한 하늘색 값.
  if (effects.length > 0) {
    segments.push(
      <span key="effects">
        <span className="text-[var(--text-muted)]">효과 </span>
        <span style={{ color: "var(--primary)" }}>{effects.join("·")}</span>
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
