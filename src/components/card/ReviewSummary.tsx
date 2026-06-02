/**
 * ReviewSummary — 시술후기 카드(type=review)의 정량 요약 한 줄 텍스트.
 *
 * Card 본문(CardBody) 바로 위에 박스 없이 인라인 텍스트로 표시:
 *   ★★★★☆ · 통증 꽤 · 재시술 있어요 · 탄력·동안
 *
 *   - 만족도: 별점만 (라벨 생략, ★×satisfaction 금색 / 나머지 옅은 회색)
 *   - 통증: 흐린 라벨 "통증" + 값(1=없음 … 5=심함)
 *   - 재시술 의향: 흐린 라벨 "재시술" + 색 값(yes=있어요 파랑 / no=없어요 빨강 / maybe=고민 중 회색)
 *   - 효과 체감: 흐린 라벨 "효과" + effect_areas 값을 가운뎃점(·)으로 연결
 *   - 항목 구분: 가운뎃점(·)
 *
 * 색·라벨은 review/new/ReviewForm.tsx 의 PAIN_FACES / REVISIT_OPTIONS 와 정합.
 * 디자인 토큰: --accent-save / --text-secondary / --text-muted.
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

/* 재시술 의향 값 — ReviewForm REVISIT_OPTIONS 와 동일 색·라벨. */
const REVISIT_TEXT: Record<string, { label: string; color: string }> = {
  yes: { label: "있어요", color: "#4CBFF2" },
  no: { label: "없어요", color: "#EA7E7B" },
  maybe: { label: "고민 중", color: "#9AA1AC" },
};

export default function ReviewSummary({ review }: { review: ReviewSummaryData }) {
  const satisfaction = Math.max(
    0,
    Math.min(5, Math.round(review.satisfaction || 0)),
  );
  const painLabel = PAIN_LABELS[review.pain] ?? null;
  const revisit = REVISIT_TEXT[review.revisit] ?? null;
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

  // 통증 — 흐린 라벨 + 값.
  if (painLabel) {
    segments.push(
      <span key="pain" className="whitespace-nowrap">
        <span className="text-[var(--text-muted)]">통증 </span>
        {painLabel}
      </span>,
    );
  }

  // 재시술 의향 — 흐린 라벨 + 색 값.
  if (revisit) {
    segments.push(
      <span key="revisit" className="whitespace-nowrap">
        <span className="text-[var(--text-muted)]">재시술 </span>
        <span className="font-semibold" style={{ color: revisit.color }}>
          {revisit.label}
        </span>
      </span>,
    );
  }

  // 효과 체감 — 흐린 라벨 + 가운뎃점으로 연결한 값.
  if (effects.length > 0) {
    segments.push(
      <span key="effects">
        <span className="text-[var(--text-muted)]">효과 </span>
        {effects.join("·")}
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
