"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 폼 이탈 방지 — beforeunload(브라우저 닫기/새로고침) + popstate(뒤로/앞으로)를 모두 커버.
 *
 * isDirty 가 true 일 때:
 *   - 브라우저 닫기/새로고침 → 네이티브 확인 다이얼로그
 *   - 뒤로가기(popstate) → URL 복원 후 showModal=true → 커스텀 모달 표시
 *
 * 사용법:
 *   const guard = useUnsavedChangesGuard(isDirty);
 *   // guard.showModal 이면 UnsavedChangesModal 렌더
 *   // guard.confirmLeave() → 이탈 실행
 *   // guard.cancelLeave() → 모달 닫기
 *   // guard.markSubmitted() → 제출 완료 후 가드 해제
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const [showModal, setShowModal] = useState(false);
  const submittedRef = useRef(false);
  const guardActiveRef = useRef(false);

  const markSubmitted = useCallback(() => {
    submittedRef.current = true;
  }, []);

  const shouldGuard = isDirty && !submittedRef.current;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldGuard) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldGuard]);

  useEffect(() => {
    if (!shouldGuard) {
      guardActiveRef.current = false;
      return;
    }

    guardActiveRef.current = true;
    window.history.pushState(null, "", window.location.href);

    const onPopState = () => {
      if (!guardActiveRef.current) return;
      window.history.pushState(null, "", window.location.href);
      setShowModal(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [shouldGuard]);

  const confirmLeave = useCallback(() => {
    guardActiveRef.current = false;
    setShowModal(false);
    window.history.go(-2);
  }, []);

  const cancelLeave = useCallback(() => {
    setShowModal(false);
  }, []);

  return { showModal, confirmLeave, cancelLeave, markSubmitted };
}
