"use client";

import { useEffect, type RefObject } from "react";

/** 모달 내부 Tab 순환 대상 — 포커스 가능한 요소 셀렉터. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * 모달 포커스 트랩 (R5-2, 2026-07-04).
 *
 * aria-modal 만으로는 실제 Tab 이동이 배경으로 새는 것을 막지 못해
 * ConfirmDialog · LoginPromptDialog · UnsavedChangesModal 3종에 공용 적용.
 *
 * 동작:
 *   - Tab / Shift+Tab → containerRef 내부 포커스 가능 요소들 사이에서만 순환.
 *   - 포커스가 모달 밖(배경)에 있으면 첫 Tab 에 모달 안으로 끌어옴.
 *   - 닫힐 때(active=false 또는 unmount) 열기 전 포커스 요소로 복원
 *     (요소가 이미 문서에서 사라졌으면 skip — 페이지 이동 등).
 *   - Escape · 배경 클릭 · 초기 포커스는 건드리지 않음 — 각 모달의 기존 로직 그대로.
 *
 * 주의: 초기 포커스를 직접 잡는 모달(예: UnsavedChangesModal)에서는 이 훅을
 * 해당 focus effect **보다 먼저** 호출해야 "열기 전 포커스"가 올바르게 캡처된다
 * (effect 는 선언 순서대로 실행 — 뒤에 두면 activeElement 가 이미 모달 내부).
 *
 * 사용:
 *   const cardRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(cardRef, open);
 *   ...
 *   <div ref={cardRef}>...</div>
 */
// 계약: containerRef 는 stable ref(useRef)여야 함 — createRef(렌더마다 새 객체) 전달 시 매 렌더 재등록됨.
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean = true,
) {
  useEffect(() => {
    if (!active) return;

    // 닫힐 때 복원할 "열기 전" 포커스 요소 (모달을 연 트리거 버튼 등)
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null); // display:none 등 비표시 요소 제외
      if (focusables.length === 0) {
        e.preventDefault(); // 순환할 대상이 없어도 배경 유출은 차단
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      const inside = current instanceof HTMLElement && container.contains(current);

      if (!inside) {
        // 포커스가 배경에 있으면 모달 안으로 끌어옴
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    // capture 단계 — 페이지의 다른 keydown 핸들러보다 먼저 Tab 을 가로챈다.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // 닫힐 때 이전 포커스 복원 — 요소가 아직 문서에 남아 있을 때만
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, active]);
}
