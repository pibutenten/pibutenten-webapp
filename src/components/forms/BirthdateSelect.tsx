"use client";

/**
 * BirthdateSelect — 생년월일 3분할(년/월/일) select 공용 컴포넌트.
 *
 * OnboardingClient.tsx 의 생년월일 블록을 추출했습니다(병원계정 B2, 2026-07-06).
 * 온보딩 · 병원 환자 등록 폼 등이 공유합니다.
 *
 * 설계:
 *  - controlled: value = 합성된 "YYYY-MM-DD"(미완성 선택 상태면 ""). 내부에서 3분할
 *    상태를 관리하고, 선택이 바뀔 때마다 합성값을 onChange 로 상위에 전달합니다.
 *  - 검증(만 14세 등)은 여기서 하지 않습니다 — 입력 UI 만 담당하고, 검증·에러 표시는
 *    호출측(온보딩 등) 책임입니다.
 *  - yearRef/monthRef/dayRef: 호출측이 검증 실패 시 특정 select 로 scroll+focus 하기 위한
 *    ref 노출(온보딩 R5-2 포커스 이동 유지). ref.current?.value 로 "어느 칸이 비었는지"도
 *    판별할 수 있습니다.
 */

import { useState, type Ref } from "react";

// 생년월일 select용 옵션 — 1920부터 현재년까지 역순(최근 우선)
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1920 + 1 },
  (_, i) => CURRENT_YEAR - i,
);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

type BirthdateParts = { year: string; month: string; day: string };

/** "YYYY-MM-DD..." → 3분할 파츠. 파싱 불가 시 전부 "". (월·일은 "5" 처럼 앞 0 제거) */
export function parseBirthdate(s: string): BirthdateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return { year: "", month: "", day: "" };
  return {
    year: m[1],
    month: String(parseInt(m[2], 10)),
    day: String(parseInt(m[3], 10)),
  };
}

/** 3분할 파츠 → "YYYY-MM-DD" 합성. 하나라도 비면 "". */
function composeBirthdate(p: BirthdateParts): string {
  return p.year && p.month && p.day
    ? `${p.year}-${p.month.padStart(2, "0")}-${p.day.padStart(2, "0")}`
    : "";
}

/** 임의 문자열(타임스탬프 포함 가능)을 "YYYY-MM-DD" 로 정규화. 파싱 불가 시 "". */
export function normalizeBirthdate(s: string): string {
  return composeBirthdate(parseBirthdate(s));
}

type Props = {
  /** 합성된 생년월일 "YYYY-MM-DD" — 미완성(부분 선택)이면 "". */
  value: string;
  /** 선택 변경 시 합성값 전달 — 3칸이 모두 차기 전에는 "" 를 전달합니다. */
  onChange: (birthdate: string) => void;
  /** 검증 실패 시 포커스 이동용 ref (호출측 선택). */
  yearRef?: Ref<HTMLSelectElement>;
  monthRef?: Ref<HTMLSelectElement>;
  dayRef?: Ref<HTMLSelectElement>;
  /** 3-select 래퍼 클래스 — 기본값은 온보딩 원본 레이아웃(부모 flex row 안에서 flex-1). */
  className?: string;
};

// select 공통 클래스 — 온보딩 원본 그대로(회귀 금지). 색은 CSS 변수만.
const selectCls =
  "h-9 rounded-md border border-[var(--border)] bg-white px-2 text-[12px] focus:border-[var(--primary)] focus:outline-none";

export default function BirthdateSelect({
  value,
  onChange,
  yearRef,
  monthRef,
  dayRef,
  className = "flex flex-1 gap-1.5",
}: Props) {
  // 부분 선택(합성 불가) 구간의 3분할 상태 — value 가 완성값("YYYY-MM-DD")이면 value 를
  // SSOT 로 파생하고(controlled), value="" 인 동안(년만 선택 등)만 내부 상태를 사용합니다.
  // effect 없이 파생하므로 onChange 루프·cascading render 가 없습니다.
  const [internal, setInternal] = useState<BirthdateParts>(() => parseBirthdate(value));
  const parts = value ? parseBirthdate(value) : internal;

  // 한 칸 변경 → 내부 상태 갱신 + 합성값(미완성이면 "") 상위 전달.
  const update = (patch: Partial<BirthdateParts>) => {
    const next = { ...parts, ...patch };
    setInternal(next);
    onChange(composeBirthdate(next));
  };

  return (
    <div className={className}>
      <select
        ref={yearRef}
        value={parts.year}
        onChange={(e) => update({ year: e.target.value })}
        className={`${selectCls} flex-[1.3]`}
      >
        <option value="">년</option>
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <select
        ref={monthRef}
        value={parts.month}
        onChange={(e) => update({ month: e.target.value })}
        className={`${selectCls} flex-1`}
      >
        <option value="">월</option>
        {MONTH_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
      <select
        ref={dayRef}
        value={parts.day}
        onChange={(e) => update({ day: e.target.value })}
        className={`${selectCls} flex-1`}
      >
        <option value="">일</option>
        {DAY_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}일
          </option>
        ))}
      </select>
    </div>
  );
}
