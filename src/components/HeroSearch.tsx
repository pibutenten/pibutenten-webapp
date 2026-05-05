"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";

const MOBILE_BP = 768;
const TARGET_TOP = 110; // 모바일 키보드 ON 시 검색창 top px (헤더 nav ~56 + 여유 ~54)

/**
 * Hero(타이틀) + 검색창 묶음.
 * - 모바일: 키보드 열림 감지 후 한 번만 정확히 페이지 스크롤로 form을 헤더 바로 아래에 배치.
 *   - setTimeout 다중호출 제거 (흔들림 방지).
 *   - h1 collapse + 키보드 슬라이드 완료까지 짧게 대기 후 1회 reposition.
 *   - blur 시 자동 reset 안 함 (칩 클릭 시 위치 유지).
 *   - 키보드 다시 열림도 감지 → 매번 reposition 보장.
 * - 데스크탑: h1 변화 없음, 진입 시 자동 포커스.
 */
export default function HeroSearch() {
  const sp = useSearchParams();
  const initialQ = (sp.get("q") ?? "").trim();
  const [focused, setFocused] = useState(false);
  const formWrapRef = useRef<HTMLDivElement>(null);

  const isMobile = useCallback(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BP,
    [],
  );

  /** 페이지 스크롤로 form을 정확히 TARGET_TOP에 배치 — 한 번만, 부드럽게 */
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

  /** focus/blur — h1 collapse용 state만 갱신, scroll은 visualViewport 핸들러에서 단일 처리 */
  function handleFocusChange(f: boolean) {
    if (!isMobile()) {
      setFocused(false);
      return;
    }
    setFocused(f);
  }

  /** visualViewport — 키보드 상태 변화 감지.
   *  키보드 열림 → document.activeElement가 우리 input일 때 안정화 대기 후 reposition (한 번).
   *  키보드 닫힘 → focused state는 건들지 않음 (실제 input.blur 시 onBlur가 자연스럽게 처리).
   *  → 키보드 다시 열림 / focus 유지된 채 키보드만 닫혔다 다시 열림 모두 정상 처리. */
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let stableTimer: number | null = null;

    const handler = () => {
      const keyboardOpen = window.innerHeight - vv.height > 100;
      const ourInput = formWrapRef.current?.querySelector("input");
      const inputFocused =
        !!ourInput && document.activeElement === ourInput;

      // 키보드 열림 + 우리 input에 focus 있음 → 안정화 후 reposition
      if (keyboardOpen && inputFocused) {
        if (stableTimer) window.clearTimeout(stableTimer);
        // 350ms = h1 collapse(300ms) + 키보드 안정 여유
        stableTimer = window.setTimeout(() => {
          stableTimer = null;
          repositionPage();
        }, 350) as unknown as number;
      } else if (!keyboardOpen && stableTimer) {
        // 키보드 닫히는 중 - 예약된 reposition 취소
        window.clearTimeout(stableTimer);
        stableTimer = null;
      }
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
