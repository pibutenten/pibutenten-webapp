"use client";

/**
 * 후기 평가 컨트롤 — 공용 UI 모듈 (후기·시술일기 통합 Phase 3b).
 *
 * 원래 /review/new/ReviewForm.tsx 안에만 있던 평가 입력 컨트롤(StarField·FaceField·
 *   ChoiceField·EffectChip·Chip)과 옵션 상수(PAIN_FACES·REVISIT_OPTIONS·RECOMMEND_OPTIONS·
 *   EFFECT_AREA_OPTIONS·EFFECT_AREA_COLORS·ONELINER 관련)를 두 곳(standalone ReviewForm,
 *   통합 visit 폼 DiaryForm 의 후기 아코디언)이 공유하도록 추출한 모듈.
 *
 * - 컨트롤 동작·디자인·색·라벨은 ReviewForm 원본과 1:1 동일 (회귀 0 목표).
 * - RECOMMEND_OPTIONS(추천의향)는 신규 — visit 경로(create_visit_with_entries)만 사용.
 *   standalone 경로(create_procedure_review)는 recommend 인자가 없으므로 ReviewForm 에선
 *   이 컨트롤을 노출하지 않는다(혼동 주의: 본 모듈은 컨트롤만 제공, 노출 여부는 호출자 결정).
 */

import { useState, type CSSProperties } from "react";
import { CATEGORIES } from "@/lib/categories";

/**
 * categoryLabel(예: "리프팅" / "스킨부스터") → CategoryWithChips 와 같은 색.
 * CATEGORIES 에서 label 로 매칭, 못 찾으면 var(--primary).
 */
export function categoryColor(label: string): string {
  return CATEGORIES.find((c) => c.label === label)?.color ?? "var(--primary)";
}

/* 통증 — 표정 이모지 1~5 컴팩트 스케일. */
export const PAIN_FACES: { face: string; label: string }[] = [
  { face: "😊", label: "없음" },
  { face: "🙂", label: "조금" },
  { face: "😐", label: "보통" },
  { face: "😣", label: "꽤" },
  { face: "😖", label: "심함" },
];

/* ── 값 키(고정 — DB CHECK 와 일치) ── */
export type ChoiceOption = { value: string; label: string; color?: string };

/** 재시술 의향(revisit) — 내가 또 받을지. DB CHECK enum yes/maybe/no. */
export const REVISIT_OPTIONS: ChoiceOption[] = [
  { value: "yes", label: "있어요", color: "#4CBFF2" },
  { value: "no", label: "없어요", color: "#EA7E7B" },
  { value: "maybe", label: "고민 중", color: "#9AA1AC" },
];

/**
 * 추천의향(recommend) — 다른 분께 권할지(1~5 척도). revisit 와 의미 다름.
 *   create_visit_with_entries 의 p_reviews[].recommend 로만 전달(visit 경로 전용).
 *   값은 1~5 정수(VisitReviewSchema.recommend, CheckinDay0Schema.recommend 와 정합).
 */
export const RECOMMEND_OPTIONS: { value: number; label: string; color: string }[] = [
  { value: 1, label: "안 해요", color: "#EA7E7B" },
  { value: 3, label: "보통", color: "#9AA1AC" },
  { value: 5, label: "추천해요", color: "#4CBFF2" },
];

/* 생생한 후기 placeholder — 마운트 시 무작위 1개 고정(세션 내 유지). */
export const ONELINER_PLACEHOLDERS: string[] = [
  "고민하는 분들께 해주고 싶은 한마디를 남겨주세요.",
  "솔직한 한 줄이 같은 고민을 가진 분께 큰 도움이 돼요.",
  "광고는 안 알려주는 걸, 당신은 알려줄 수 있어요.",
  "받기 전과 후, 무엇이 가장 달라졌나요?",
  "기대했던 것과 비교해 어떠셨어요?",
  "이건 미리 알았으면 좋았겠다 싶은 점이 있었나요?",
  "별로였다면 별로였다고. 솔직한 한 줄이 다음 사람에겐 큰 도움이 돼요.",
  "아팠으면 아팠다고, 효과 없었으면 없었다고. 그게 진짜 데이터예요.",
];

export const ONELINER_MAX = 400;

/**
 * 체감 효과 옵션 — 독립 목록 18종 + '없음'(19번째) (온보딩 피부고민과 별개).
 * 순서: 리프팅·탄력·쫀쫀함·볼륨·작은얼굴·턱선·이중턱·피부톤·피부결·잔주름·깊은주름·불독살·모공·생기·속건조·붉은기·트러블·피지·없음.
 * 저장값(effect_areas)은 이 라벨 문자열 그대로. '없음'도 일반 칩(배타 로직 없음).
 */
export const EFFECT_AREA_OPTIONS: string[] = [
  "리프팅",
  "탄력",
  "쫀쫀함",
  "볼륨",
  "작은얼굴",
  "턱선",
  "이중턱",
  "피부톤",
  "피부결",
  "잔주름",
  "깊은주름",
  "불독살",
  "모공",
  "생기",
  "속건조",
  "붉은기",
  "트러블",
  "피지",
  "없음",
];
/** 효과 칩 색 — EFFECT_AREA_OPTIONS 와 동일 인덱스 매칭 (16색 파스텔 + '없음' 중립 회색). */
export const EFFECT_AREA_COLORS: string[] = [
  "#B0A0DE",
  "#7FD0F8",
  "#F59CB6",
  "#FFCB8C",
  "#A6D9A9",
  "#C3B0E8",
  "#79CCC3",
  "#FFAF97",
  "#9AA6DE",
  "#CDC97A",
  "#C9A8D6",
  "#A8C2E6",
  "#8FD4C8",
  "#F4B8A0",
  "#B8D88A",
  "#F2A9C0",
  "#D6B0A1",
  "#E0C088",
  "#C2C7CE",
];

/* ─────────────────────────────────────────────────────────────
 * Chip — 둥근 pill 선택 칩 (OnboardingClient 피부고민 칩과 동일 톤).
 *   비활성: #E8EAEE / #5C6470 / 500.
 *   color 미지정 활성: #4CBFF2 / 흰색 / 600.
 *   color 지정: 선택됨 = 색 solid 배경 + 흰 글씨. 호버(미선택) = 색 연한 톤(color+"22")
 *     배경 + color 글씨 미리보기. 평소 미선택 = 회색.
 * ───────────────────────────────────────────────────────────── */
export function Chip({
  active,
  onClick,
  disabled,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  let style: CSSProperties;
  if (active) {
    style = color
      ? { backgroundColor: color, color: "#FFFFFF", fontWeight: 600 }
      : { backgroundColor: "#4CBFF2", color: "#FFFFFF", fontWeight: 600 };
  } else if (color && hover && !disabled) {
    style = { backgroundColor: color + "22", color, fontWeight: 600 };
  } else {
    style = { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 };
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 * EffectChip — 효과(멀티) 칩. 옵션별 고유색.
 *   선택=칸 색 solid+흰 글씨 / 미선택=회색. 호버 상태 없음
 *     (모바일에서 탭 후 hover 가 남아 해제해도 진한 회색으로 보이던 버그 제거).
 * ───────────────────────────────────────────────────────────── */
export function EffectChip({
  active,
  color,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const style: CSSProperties = active
    ? { backgroundColor: color, color: "#FFFFFF", fontWeight: 600 }
    : { backgroundColor: "#E8EAEE", color: "#5C6470", fontWeight: 500 };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1 text-[13px] disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
 * StarField — 1~5 별점 입력.
 *   호버 미리채움: 마우스 올린 위치까지 연한 확정색으로 미리보기,
 *   클릭하면 그 값이 진한 확정색으로 확정.
 * ───────────────────────────────────────────────────────────── */
export function StarField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}{" "}
      </label>
      <div
        className="flex justify-start gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const confirmed = n <= value;
          const hoverExtra = hover > 0 && n > value && n <= hover;
          const gold = confirmed || hoverExtra;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n}점`}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              disabled={disabled}
              className="flex w-11 cursor-pointer items-center justify-center text-[34px] leading-none transition-transform active:scale-125 disabled:opacity-50"
            >
              <span
                style={{
                  color: gold
                    ? hoverExtra
                      ? "#F7CE8A"
                      : "var(--accent-save)"
                    : "#E3E7EB",
                }}
              >
                ★
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FaceField — 표정 이모지 1~5 컴팩트 스케일 (통증 등).
 * ───────────────────────────────────────────────────────────── */
export function FaceField({
  label,
  value,
  onChange,
  faces,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  faces: { face: string; label: string }[];
  disabled?: boolean;
  required?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        {label}
      </label>
      <div
        className="flex justify-start gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {faces.map((f, i) => {
          const n = i + 1;
          const selected = n === value;
          const previewing = !selected && n === hover && !disabled;
          const on = selected || previewing;

          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              disabled={disabled}
              aria-label={`${label} ${n} ${f.label}`}
              aria-pressed={selected}
              className="flex w-11 cursor-pointer flex-col items-center justify-center gap-1 py-1 transition-transform active:scale-125 disabled:opacity-50"
            >
              <span
                className="text-[30px] leading-none"
                style={{
                  filter: on ? "none" : "grayscale(1)",
                  opacity: selected ? 1 : previewing ? 0.85 : 0.4,
                }}
              >
                {f.face}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: selected ? "var(--text)" : "var(--text-secondary)" }}
              >
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * ChoiceField — 가변 개수 {value,label}[] 단일 선택 칩 그룹.
 *   칩 톤은 Chip 과 통일. 재시술 의향에 사용.
 * ───────────────────────────────────────────────────────────── */
export function ChoiceField({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
        {label}
        {hint && (
          <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            color={opt.color}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * NumberChoiceField — 숫자 값(1~5 등) 단일 선택 칩 그룹.
 *   추천의향(recommend, 1~5)처럼 값이 number 인 단일선택에 사용.
 * ───────────────────────────────────────────────────────────── */
export function NumberChoiceField({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string; color?: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[var(--text)]">
        {label}
        {hint && (
          <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            active={value === opt.value}
            color={opt.color}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
