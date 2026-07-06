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

/** 유효한 달력 날짜인지(연 1920~올해·월 1~12·일 1~말일) 검사. */
function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1920 || y > CURRENT_YEAR) return false;
  if (m < 1 || m > 12) return false;
  // 해당 연·월의 말일(윤년 포함) 계산 — new Date(y, m, 0).getDate() = m월 말일.
  const lastDay = new Date(y, m, 0).getDate();
  return d >= 1 && d <= lastDay;
}

/**
 * 직접 타이핑 입력(자유 형식)을 "YYYY-MM-DD" 로 파싱. 유효하지 않으면 "".
 *
 * 허용 형식(C12):
 *  - `790126` (6자리, 2자리 연도) · `19790126` (8자리, 4자리 연도)
 *  - `1979-01-26` · `1979.01.26` · `1979/01/26` (구분자 - . / 및 공백)
 *  - 구분자가 있으면 `79-1-26` 처럼 앞 0 없는 부분도 허용.
 *
 * 2자리 연도 피벗(성인 환자 기준): yy > (올해 2자리)+1 → 19yy, else 20yy.
 *   예) 올해 2026 → 임계 27. `26`→2026, `28`→1928, `79`→1979.
 *   (미래 생일 방지: 올해+1 까지만 2000년대로 해석.)
 */
export function parseFreeBirthdate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  let y: number, m: number, d: number;

  // 1) 구분자 포함(- . / 또는 공백) — 3토막.
  const sep = s.split(/[.\-/\s]+/).filter(Boolean);
  if (sep.length === 3) {
    y = parseInt(sep[0], 10);
    m = parseInt(sep[1], 10);
    d = parseInt(sep[2], 10);
    if ([y, m, d].some(Number.isNaN)) return "";
    if (sep[0].length <= 2) y = pivot2DigitYear(y);
  } else if (/^\d+$/.test(s)) {
    // 2) 숫자만 — 6자리(yyMMdd) 또는 8자리(yyyyMMdd).
    if (s.length === 8) {
      y = parseInt(s.slice(0, 4), 10);
      m = parseInt(s.slice(4, 6), 10);
      d = parseInt(s.slice(6, 8), 10);
    } else if (s.length === 6) {
      y = pivot2DigitYear(parseInt(s.slice(0, 2), 10));
      m = parseInt(s.slice(2, 4), 10);
      d = parseInt(s.slice(4, 6), 10);
    } else {
      return ""; // 자릿수 부족(부분 입력) → 미완성 취급.
    }
  } else {
    return "";
  }

  if (!isValidYmd(y, m, d)) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 2자리 연도 → 4자리(성인 환자 피벗). yy > (올해 2자리)+1 → 1900대, else 2000대. */
function pivot2DigitYear(yy: number): number {
  const threshold = (CURRENT_YEAR % 100) + 1;
  return yy > threshold ? 1900 + yy : 2000 + yy;
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
// 직접입력 텍스트 인풋 — select 와 동일 톤(색은 CSS 변수만).
const textCls =
  "h-9 w-full rounded-md border border-[var(--border)] bg-white px-2 text-[12px] focus:border-[var(--primary)] focus:outline-none";

/** value("YYYY-MM-DD"|"")를 직접입력 인풋의 표시 문자열로. 미완성이면 빈 칸. */
function displayFromValue(v: string): string {
  return v || "";
}

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

  // 직접입력 텍스트 상태 — 사용자가 자유롭게 타이핑(부분입력 포함)하는 원문을 그대로 보관합니다.
  // 드롭다운으로 value 가 외부에서 바뀌면(아래 seenValue 비교) 표시 문자열을 재동기화해
  // "한쪽 바꾸면 다른쪽 반영"을 effect 없이 구현합니다. (파일 기존 파생-동기 패턴 계승.)
  const [typed, setTyped] = useState<string>(() => displayFromValue(value));
  const [seenValue, setSeenValue] = useState<string>(value);
  if (value !== seenValue) {
    // value 가 이 컴포넌트 밖(드롭다운 update·부모)에서 바뀜 → 텍스트도 맞춰 재동기화.
    // 단, 텍스트 입력이 유효 파싱되어 같은 value 로 이어진 경우엔 원문 타이핑을 보존.
    if (parseFreeBirthdate(typed) !== value) {
      setTyped(displayFromValue(value));
    }
    setSeenValue(value);
  }

  // 한 칸 변경 → 내부 상태 갱신 + 합성값(미완성이면 "") 상위 전달.
  const update = (patch: Partial<BirthdateParts>) => {
    const next = { ...parts, ...patch };
    setInternal(next);
    onChange(composeBirthdate(next));
  };

  // 직접입력 변경 → 원문 보관 + 유효하면 정규화 value 전달(미완성·무효면 "" 전달).
  //   "" 전달 시 온보딩 검증(`if (!birthdate)`)이 기존처럼 작동합니다(회귀 없음).
  const onType = (raw: string) => {
    setTyped(raw);
    const parsed = parseFreeBirthdate(raw);
    setInternal(parseBirthdate(parsed)); // 드롭다운도 즉시 반영(유효 시), 무효면 전부 "".
    onChange(parsed);
  };

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      {/* 직접입력 — 790126 · 19790126 · 1979-01-26 · 1979.01.26 자유 파싱(C12). */}
      <input
        type="text"
        inputMode="numeric"
        value={typed}
        onChange={(e) => onType(e.target.value)}
        placeholder="예: 790126 또는 1979-01-26"
        autoComplete="off"
        spellCheck={false}
        className={textCls}
        aria-label="생년월일 직접 입력"
      />
      {/* 드롭다운 — 기존 3분할(온보딩 회귀 금지). 직접입력과 같은 value 공유. */}
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
    </div>
  );
}
