"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { registerNavGuard } from "@/lib/nav-guard";

/**
 * 폼 이탈 방지 — beforeunload(브라우저 닫기/새로고침) + popstate(뒤로/앞으로)
 * + 하단 내비(BottomNav Link) 이동(nav-guard)을 모두 커버.
 *
 * isDirty 가 true 일 때:
 *   - 브라우저 닫기/새로고침 → 네이티브 확인 다이얼로그
 *   - 뒤로가기(popstate) → URL 복원 후 showModal=true → 커스텀 모달 표시
 *   - 하단/데스크탑 내비 Link 클릭 → maybeBlockNavigation 으로 가로채 모달 표시
 *
 * 이탈 실행은 모두 pendingProceedRef 로 통일 (popstate=history.go(-2), Link=router.push 등).
 *
 * 사용법:
 *   const guard = useUnsavedChangesGuard(isDirty, { onSaveDraft, onDiscardDraft });
 *   // guard.showModal 이면 UnsavedChangesModal 렌더
 *   // [임시저장 후 종료] → guard.confirmSaveAndLeave()
 *   // [글쓰기 종료]     → guard.confirmDiscardAndLeave()
 *   // [계속 작성]/배경/Esc → guard.cancelLeave()
 *   // guard.markSubmitted() → 제출 완료 후 가드 해제
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  opts?: { onSaveDraft?: () => void; onDiscardDraft?: () => void },
) {
  const [showModal, setShowModal] = useState(false);
  const submittedRef = useRef(false);
  const guardActiveRef = useRef(false);
  // 이탈 확정 시 실행할 동작 (popstate / Link 등 트리거별로 세팅).
  const pendingProceedRef = useRef<(() => void) | null>(null);
  // opts 는 매 렌더 새 객체일 수 있으므로 ref 로 최신값 참조 (effect deps 안정화).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // shouldGuardRef 를 markSubmitted 보다 먼저 선언해 useCallback 내부에서 직접 참조 가능하게 함.
  //   초기값은 false(매 렌더 아래에서 최신 shouldGuard 로 갱신하므로 초기값은 첫 렌더 즉시 덮임).
  const shouldGuardRef = useRef(false);

  // 제출 완료 → 가드 해제. submittedRef 뿐 아니라 shouldGuardRef 도 동기로 내려서,
  //   저장 직후 router.push("/notes") 처럼 finishLeave 를 안 거치는 이동 경로가
  //   같은 틱에 nav-guard(isDirty=()=>shouldGuardRef.current)를 다시 켜 모달이 재오픈되는 재진입을 차단.
  const markSubmitted = useCallback(() => {
    submittedRef.current = true;
    shouldGuardRef.current = false;
  }, []);

  const shouldGuard = isDirty && !submittedRef.current;
  shouldGuardRef.current = shouldGuard;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldGuard) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldGuard]);

  // 하단/데스크탑 내비(BottomNav Link) 이동 가로채기 — nav-guard 모듈에 자신을 등록.
  useEffect(() => {
    if (!shouldGuard) return;
    const unregister = registerNavGuard({
      isDirty: () => shouldGuardRef.current,
      requestLeave: (proceed) => {
        pendingProceedRef.current = proceed;
        setShowModal(true);
      },
    });
    return unregister;
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
      // 이탈 확정 시 한 칸 더 들어온 가드 엔트리까지 함께 되돌리기 위해 -2.
      pendingProceedRef.current = () => {
        guardActiveRef.current = false;
        window.history.go(-2);
      };
      setShowModal(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [shouldGuard]);

  // 이탈 실행 공통 — 가드 해제 + 잔여 beforeunload/popstate 재트리거 차단 후 proceed 실행.
  //   shouldGuardRef 도 동기 false 로 내림: proceed 가 동기 실행되는 동안(예: goHome 이
  //   자기 자신을 maybeBlockNavigation 으로 다시 감싸는 경로) nav-guard 의
  //   isDirty=()=>shouldGuardRef.current 가 아직 true 라 모달이 재오픈되는 재진입을 차단.
  //   (submittedRef 만으로는 다음 렌더 전까지 shouldGuardRef 가 갱신되지 않음.)
  const finishLeave = useCallback(() => {
    guardActiveRef.current = false;
    submittedRef.current = true;
    shouldGuardRef.current = false;
    setShowModal(false);
    const p = pendingProceedRef.current;
    pendingProceedRef.current = null;
    p?.();
  }, []);

  const confirmSaveAndLeave = useCallback(() => {
    optsRef.current?.onSaveDraft?.();
    finishLeave();
  }, [finishLeave]);

  const confirmDiscardAndLeave = useCallback(() => {
    optsRef.current?.onDiscardDraft?.();
    finishLeave();
  }, [finishLeave]);

  const cancelLeave = useCallback(() => {
    pendingProceedRef.current = null;
    setShowModal(false);
  }, []);

  return {
    showModal,
    confirmSaveAndLeave,
    confirmDiscardAndLeave,
    cancelLeave,
    markSubmitted,
  };
}
