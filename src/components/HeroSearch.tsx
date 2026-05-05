"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

const MOBILE_BP = 768;
const TARGET_TOP = 80; // 헤더(56) + 여유(24)

/**
 * 이전 정적 사이트(jminbae.github.io/pbtt-search)에서 검증된 패턴 그대로 옮김:
 *  - main을 transform: translate3d로 슬라이드 업 (page scroll 아님)
 *  - focus 즉시 한 번만 호출 (visualViewport 기다리지 않음 → 부드러움)
 *  - blur 100ms 후 revertIfEmpty: input.value가 있으면 reset 안 함 → 칩 클릭 시 위치 유지
 *  - visualViewport 키보드 닫힘 감지: value 비어있을 때만 revert
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const removeStyleTimerRef = useRef<number | null>(null);

  const isMobile = useCallback(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP,
    [],
  );

  const clearPending = useCallback(() => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    if (removeStyleTimerRef.current) {
      window.clearTimeout(removeStyleTimerRef.current);
      removeStyleTimerRef.current = null;
    }
  }, []);

  /** main 전체(검색창 + 칩 + 결과)를 살짝 위로 슬라이드 — focus 시 즉시 한 번만 */
  const slideUp = useCallback(() => {
    if (!isMobile()) return;
    const main = document.querySelector("main") as HTMLElement | null;
    const form = formWrapRef.current?.querySelector("form");
    if (!main || !form) return;
    clearPending();
    // 측정 전 transform 제거하고 reflow
    main.style.transition = "none";
    main.style.transform = "none";
    void main.offsetHeight;
    const rect = form.getBoundingClientRect();
    const shift = Math.min(0, -(rect.top - TARGET_TOP));
    main.style.transition = "";
    setFocused(true);
    main.style.transform =
      shift === 0 ? "" : `translate3d(0, ${shift}px, 0)`;
  }, [isMobile, clearPending]);

  /** input.value 비어있을 때만 원래 자리로 — 입력했으면 위치 유지 (칩 클릭 보호) */
  const revertIfEmpty = useCallback(() => {
    const main = document.querySelector("main") as HTMLElement | null;
    const input = formWrapRef.current?.querySelector("input");
    if (!main || !input) return;
    if (input.value.trim()) return; // 글자 있으면 유지
    setFocused(false);
    main.style.transform = "translate3d(0, 0, 0)";
    removeStyleTimerRef.current = window.setTimeout(() => {
      main.style.transform = "";
      removeStyleTimerRef.current = null;
    }, 400) as unknown as number;
  }, []);

  function handleFocusChange(f: boolean) {
    if (!isMobile()) {
      setFocused(false);
      return;
    }
    if (f) {
      slideUp();
    } else {
      // blur — 100ms 지연. 그 사이 다른 focus가 들어오면 cancel.
      blurTimerRef.current = window.setTimeout(() => {
        revertIfEmpty();
        blurTimerRef.current = null;
      }, 100) as unknown as number;
    }
  }

  /** visualViewport — 키보드 진짜 닫힘 (Android 백버튼 등) → value 비어있으면 revert */
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let lastKeyboardOpen = false;
    const handler = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      if (lastKeyboardOpen && !keyboardOpen) {
        revertIfEmpty();
      }
      lastKeyboardOpen = keyboardOpen;
    };
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, [revertIfEmpty]);

  /** 재탭 폴백 (Android Chrome: blur 후에도 input focus가 유지되어 focus 이벤트가 안 뜨는 경우) */
  useEffect(() => {
    const input = formWrapRef.current?.querySelector("input");
    if (!input) return;
    const reTap = () => {
      setTimeout(() => {
        if (isMobile()) slideUp();
      }, 30);
    };
    input.addEventListener("pointerdown", reTap);
    input.addEventListener("click", reTap);
    return () => {
      input.removeEventListener("pointerdown", reTap);
      input.removeEventListener("click", reTap);
    };
  }, [slideUp, isMobile]);

  /** 컴포넌트 unmount 시 main transform 정리 (페이지 이동 등) */
  useEffect(() => {
    return () => {
      const main = document.querySelector("main") as HTMLElement | null;
      if (main) main.style.transform = "";
      clearPending();
    };
  }, [clearPending]);

  return (
    <header className="text-center pt-10 sm:pt-14">
      <h1
        className="overflow-hidden font-extrabold text-[var(--primary)] transition-[opacity,max-height,margin] duration-300"
        style={{
          fontSize: "clamp(26px, 6vw, 32px)",
          letterSpacing: "-0.8px",
          opacity: focused ? 0 : 1,
          maxHeight: focused ? 0 : "120px",
          marginBottom: focused ? 0 : "32px",
          pointerEvents: focused ? "none" : "auto",
        }}
      >
        피부가 예뻐지는 모든 이야기
      </h1>
      <div ref={formWrapRef}>
        <SearchBar
          initialValue={initialQ}
          onFocusChange={handleFocusChange}
          autoFocusOnDesktop={!initialQ}
        />
      </div>
    </header>
  );
}
