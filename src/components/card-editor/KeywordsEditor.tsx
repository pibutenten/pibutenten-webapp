"use client";

/**
 * KeywordsEditor — 카드 태그 입력 칩 + 입력창.
 *
 * 추출 배경 (2026-05-17):
 *   /write, /admin/cards/[id]/edit, /write/[shortcode] 세 페이지에서 거의 동일한
 *   "태그 칩 + 입력창 + IME 안전 Enter/Space 추가" 패턴이 100~140줄씩 중복돼 있었음.
 *   통합 후 라벨·최대 개수·placeholder 만 props 로 받아 모든 페이지가 공유.
 *
 * IME(한글) 안전성:
 *   - keydown 시 isComposing 또는 keyCode===229 이면 무시 (한글 마지막 글자 분리 버그 방지)
 *   - Enter 또는 Space 입력 시 자동 추가 (네이버 블로그 패턴)
 *
 * 중복·최대치 검증:
 *   - 중복 태그 → onError("이미 등록된 태그입니다.")
 *   - max 초과 → onError(`태그는 최대 N개까지 가능합니다.`)
 *   - 검증 통과 → onChange(newArray) + 입력 초기화
 *
 * 호출처가 normalizeTags(@/lib/tag-dictionary)를 추가로 호출하고 싶으면 onChange 콜백 안에서.
 */

import { useState, type ReactNode } from "react";

type Props = {
  /** 현재 등록된 태그 배열 */
  keywords: string[];
  /** 변경 콜백 (추가/삭제 모두) */
  onChange: (next: string[]) => void;
  /** 에러 메시지 표시 콜백 (중복/최대 초과). null = clear */
  onError?: (message: string | null) => void;
  /** 최대 개수 (default: 10). 0 이면 컴포넌트 전체 비표시. */
  max?: number;
  /** 최소 개수 (UI 라벨 표시용). default: 0 */
  min?: number;
  /** 입력창 placeholder */
  placeholder?: string;
  /** 라벨 텍스트 (default: "태그") */
  label?: string;
  /** 라벨 오른쪽에 표시할 추가 UI (예: admin 의 ✨ 자동 추출 버튼) */
  labelExtra?: ReactNode;
  /** 비활성 (저장 중 등) */
  disabled?: boolean;
};

export default function KeywordsEditor({
  keywords,
  onChange,
  onError,
  max = 10,
  min = 0,
  placeholder = "Enter 또는 띄어쓰기로 추가",
  label = "태그",
  labelExtra,
  disabled = false,
}: Props) {
  const [input, setInput] = useState("");

  // max=0 이면 폼에서 태그 섹션 자체 비표시 (예: 일부 post 타입)
  if (max === 0) return null;

  function add(raw: string) {
    const v = raw.trim().replace(/^#/, "");
    if (!v) return;
    if (keywords.includes(v)) {
      onError?.("이미 등록된 태그입니다.");
      return;
    }
    if (keywords.length >= max) {
      onError?.(`태그는 최대 ${max}개까지 가능합니다.`);
      return;
    }
    onChange([...keywords, v]);
    setInput("");
    onError?.(null);
  }

  function remove(k: string) {
    onChange(keywords.filter((x) => x !== k));
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-semibold text-[var(--text)]">
          {label}{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            {min > 0 ? `${min}~${max}개` : `최대 ${max}개`}
          </span>
        </label>
        {labelExtra}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => remove(k)}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20 disabled:opacity-50"
          >
            {k} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // IME (한글) 입력 중 keydown 은 무시 — "써마지" 후 Space 누를 때
            // IME 종료 이벤트로 마지막 글자 "지" 가 분리되어 들어오는 버그 방지.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" || e.key === " " || e.code === "Space") {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => add(input)}
          disabled={disabled}
          className="h-9 shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </div>
  );
}
