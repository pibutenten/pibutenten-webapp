"use client";

import { useEffect, useState, useCallback } from "react";
import type { KeyboardEvent } from "react";

/** 자동완성 목록 키보드 네비 공용 훅(↑↓ 하이라이트 이동, Enter 선택, 한글 IME 가드).
 *  병원검색·시술선택·헤더검색 자동완성이 공유. (SkinDiaryForms 병원검색 패턴 추출) */
export function useAutocompleteKeyboard({
  count,
  onSelect,
  enabled = true,
}: {
  count: number;                    // 현재 후보 개수
  onSelect: (index: number) => void; // Enter/선택 시 호출(유효 index)
  enabled?: boolean;                // 자동완성 열림 여부(닫히면 네비 비활성)
}): {
  activeIndex: number;              // -1 = 없음
  setActiveIndex: (i: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void; // input 에 부착
  reset: () => void;                // 하이라이트 해제(-1)
} {
  const [activeIndex, setActiveIndex] = useState(-1);
  // 후보 개수 변할 때 하이라이트 초기화(옛 인덱스로 오선택 방지).
  useEffect(() => { setActiveIndex(-1); }, [count]);
  const reset = useCallback(() => setActiveIndex(-1), []);
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!enabled || count <= 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((cur) => {
        const n = e.key === "ArrowDown" ? cur + 1 : cur - 1;
        return Math.max(0, Math.min(count - 1, n));
      });
      return;
    }
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return; // IME 조합 확정용 Enter 무시
      if (activeIndex >= 0 && activeIndex < count) {
        e.preventDefault();
        onSelect(activeIndex);
      }
    }
  }, [enabled, count, activeIndex, onSelect]);
  return { activeIndex, setActiveIndex, onKeyDown, reset };
}
