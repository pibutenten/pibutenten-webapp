"use client";

/**
 * 비로그인 흥미 점수 임계점 도달 시 회원가입 권유 모달 표시 (2026-05-21).
 *
 * 동작:
 *   1) layout.tsx 에 mount. SSR session 으로 비로그인 여부 즉시 판단.
 *   2) 비로그인이면 `pibutenten:engagement-threshold` window event 리스닝.
 *   3) 임계점 도달 시 LoginPromptDialog 노출 + 5분 머묾 / 10분 머묾 점수 자동 누적.
 *   4) 닫음 ("나중에" / X) → dismissEngagementPrompt() 로 일주일 dismiss.
 *   5) 로그인 사용자 = no-op.
 */

import { useEffect, useState } from "react";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { useSession } from "@/lib/session-context";
import {
  addEngagement,
  dismissEngagementPrompt,
  ENGAGEMENT_EVENT,
} from "@/lib/engagement-score";

export default function EngagementPromptListener() {
  const session = useSession();
  const isLoggedIn = !!session;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoggedIn) return; // 로그인 사용자 = no-op
    if (typeof window === "undefined") return;

    // 임계점 도달 event 수신 → modal 표시
    function onThreshold() {
      setOpen(true);
    }
    window.addEventListener(ENGAGEMENT_EVENT, onThreshold);

    // 5분 / 10분 머묾 타이머 — 백그라운드/포그라운드 무관 단순 setTimeout.
    //   (visibilitychange 정교 처리는 Phase 2.5 — 현재는 페이지 떠나면 자연 cleanup)
    const t5 = window.setTimeout(() => addEngagement("dwell-5min"), 5 * 60 * 1000);
    const t10 = window.setTimeout(() => addEngagement("dwell-10min"), 10 * 60 * 1000);

    return () => {
      window.removeEventListener(ENGAGEMENT_EVENT, onThreshold);
      window.clearTimeout(t5);
      window.clearTimeout(t10);
    };
  }, [isLoggedIn]);

  if (isLoggedIn) return null;

  return (
    <LoginPromptDialog
      open={open}
      message="피부텐텐이 마음에 드시나요?"
      onClose={() => {
        setOpen(false);
        dismissEngagementPrompt();
      }}
    />
  );
}
