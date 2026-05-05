"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

const MOBILE_BP = 768;
const TARGET_TOP = 30; // 키보드 ON 시 검색창 top px (헤더 56 바로 아래에 가깝게)

/**
 * 모바일 키보드 통합 처리:
 *  - focus → 원래 scrollY 기억
 *  - 키보드 ON 안정 후(350ms) form을 TARGET_TOP에 맞춰 reposition
 *  - 키보드 OFF + window.__pbttHoldPosition !== true → 원래 자리로 복귀
 *  - 키보드 OFF + window.__pbttHoldPosition === true (칩 클릭) → 위치 유지
 *  - 두 번째 focus도 매번 동일 처리
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);
  const originalScrollYRef = useRef<number>(0);

  const isMobile = useCallback(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP,
    [],
  );

  const repositionPage = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isMobile()) return;
    const form = formWrapRef.current?.querySelector("form");
    if (!form) return;
    const rect = form.getBoundingClientRect();
    const diff = rect.top - TARGET_TOP;
    if (Math.abs(diff) < 2) return;
    window.scrollBy({ top: diff, behavior: "smooth" });
  }, [isMobile]);

  function handleFocusChange(f: boolean) {
    if (!isMobile()) {
      setFocused(false);
      return;
    }
    if (f) {
      // 첫 focus만 원래 scrollY 기억 (재포커스 때는 이미 위로 올라간 상태)
      if (!focused) originalScrollYRef.current = window.scrollY;
      setFocused(true);
    } else {
      setFocused(false);
      // blur 자체에선 scroll 안 건드림 — visualViewport에서 키보드 OFF 감지 후 처리
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let stableTimer: number | null = null;
    let lastKeyboardOpen = false;

    const handler = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      const ourInput = formWrapRef.current?.querySelector("input");
      const inputFocused =
        !!ourInput && document.activeElement === ourInput;

      if (keyboardOpen && inputFocused) {
        if (stableTimer) window.clearTimeout(stableTimer);
        stableTimer = window.setTimeout(() => {
          stableTimer = null;
          repositionPage();
        }, 350) as unknown as number;
      }

      // 키보드 OFF 감지 — 칩 클릭(holdPosition)이 아니면 원래 자리로 복귀
      if (lastKeyboardOpen && !keyboardOpen) {
        if (stableTimer) {
          window.clearTimeout(stableTimer);
          stableTimer = null;
        }
        // 글로벌 플래그 체크 — 칩 클릭 시 켜짐
        const hold =
          (window as unknown as { __pbttHoldPosition?: boolean })
            .__pbttHoldPosition === true;
        if (!hold) {
          // 짧은 지연 — visualViewport 변경이 native scroll 조정과 겹치는 것 회피
          setTimeout(() => {
            window.scrollTo({
              top: originalScrollYRef.current,
              behavior: "smooth",
            });
          }, 100);
        }
        // hold 플래그는 칩 클릭 처리 후 라우터 이동되어 컴포넌트 새로 mount될 가능성 → 안전하게 reset
        (
          window as unknown as { __pbttHoldPosition?: boolean }
        ).__pbttHoldPosition = false;
      }

      lastKeyboardOpen = keyboardOpen;
    };

    vv.addEventListener("resize", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      if (stableTimer) window.clearTimeout(stableTimer);
    };
  }, [repositionPage]);

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
