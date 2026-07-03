"use client";

/**
 * 비로그인 흥미 점수 임계점 도달 시 회원가입 권유 모달 표시 (2026-05-21 신설, v2 2026-05-22).
 *
 * v2 개선:
 *   - Page Visibility API: dwell 누적은 visible 시간만 카운트 (백그라운드 탭 정지).
 *   - 모달 표시도 visible 시점에만 (백그라운드에서 임계점 도달 시 visible 될 때까지 대기).
 *   - reason 전달: custom event detail.reason 으로 어떤 trigger 가 임계점 발사했는지 전달
 *     → EngagementPromptDialog 가 reason 별 카피 선택.
 *   - dwell 2분 신규 (5분/10분에 추가).
 *
 * 동작:
 *   1) layout.tsx 에 mount. SSR session 으로 비로그인 여부 즉시 판단.
 *   2) 비로그인이면 `pibutenten:engagement-threshold` window event 리스닝.
 *   3) 임계점 도달 시 EngagementPromptDialog 노출 + 2/5/10분 머묾 점수 자동 누적 (visible 누적).
 *   4) 닫음 ("나중에" / X) → dismissEngagementPrompt() 로 일주일 dismiss.
 *   5) 로그인 사용자 = no-op.
 */

import { useEffect, useRef, useState } from "react";
import EngagementPromptDialog from "@/components/EngagementPromptDialog";
import { useSession } from "@/lib/session-context";
import {
  addEngagement,
  dismissEngagementPrompt,
  ENGAGEMENT_EVENT,
  type EngagementEventDetail,
  type EngagementReason,
} from "@/lib/engagement-score";

const DWELL_MARKS_MS = [
  { ms: 2 * 60 * 1000, reason: "dwell-2min" as EngagementReason, fired: false },
  { ms: 5 * 60 * 1000, reason: "dwell-5min" as EngagementReason, fired: false },
  { ms: 10 * 60 * 1000, reason: "dwell-10min" as EngagementReason, fired: false },
];

export default function EngagementPromptListener() {
  const session = useSession();
  const isLoggedIn = !!session;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<EngagementReason>("card-view");

  // 임계점 도달했지만 백그라운드 탭이라 모달 보류 중인 상태
  const pendingOpenRef = useRef<{ reason: EngagementReason } | null>(null);
  // 누적 visible 시간 추적 (ms)
  const visibleElapsedRef = useRef<number>(0);
  // 마지막 visible 진입 시각 (ms)
  const lastVisibleAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoggedIn) return;
    if (typeof window === "undefined") return;
    if (typeof document === "undefined") return;

    const dwellMarks = DWELL_MARKS_MS.map((m) => ({ ...m })); // 인스턴스별 fired 추적

    // ── visible 시간 누적기 ──
    function startVisible() {
      lastVisibleAtRef.current = Date.now();
    }
    function pauseVisible() {
      if (lastVisibleAtRef.current === null) return;
      const delta = Date.now() - lastVisibleAtRef.current;
      visibleElapsedRef.current += delta;
      lastVisibleAtRef.current = null;
    }
    function getElapsed(): number {
      if (lastVisibleAtRef.current === null) return visibleElapsedRef.current;
      return visibleElapsedRef.current + (Date.now() - lastVisibleAtRef.current);
    }

    // 1초마다 dwell 마크 체크 (visible 일 때만)
    const dwellTick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const elapsed = getElapsed();
      for (const m of dwellMarks) {
        if (!m.fired && elapsed >= m.ms) {
          m.fired = true;
          addEngagement(m.reason);
        }
      }
    }, 1000);

    // 임계점 도달 event 수신 — visible 이면 즉시 open, hidden 이면 보류
    function onThreshold(e: Event) {
      const detail = (e as CustomEvent<EngagementEventDetail>).detail;
      const r = detail?.reason ?? "card-view";
      if (document.visibilityState === "visible") {
        setReason(r);
        setOpen(true);
      } else {
        pendingOpenRef.current = { reason: r };
      }
    }
    window.addEventListener(ENGAGEMENT_EVENT, onThreshold);

    // visibilitychange — 시간 누적 + 보류된 모달 발사
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        startVisible();
        // 백그라운드 동안 임계점 도달했으면 이제 모달 open
        if (pendingOpenRef.current) {
          const { reason: pr } = pendingOpenRef.current;
          pendingOpenRef.current = null;
          setReason(pr);
          setOpen(true);
        }
      } else {
        pauseVisible();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 초기 상태 — mount 시점이 visible 이면 누적 시작
    if (document.visibilityState === "visible") {
      startVisible();
    }

    return () => {
      window.removeEventListener(ENGAGEMENT_EVENT, onThreshold);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(dwellTick);
      pauseVisible();
    };
  }, [isLoggedIn]);

  if (isLoggedIn) return null;

  return (
    <EngagementPromptDialog
      open={open}
      reason={reason}
      onClose={(kind) => {
        setOpen(false);
        // v5(2026-07-03): '나중에 할게요'=3일, 바깥클릭·ESC·CTA 이동=1일
        //   (실수성 닫힘에 7일 전면 잠금이 걸려 소프트월이 죽은 듯 보이던 문제 — 원장 피드백).
        dismissEngagementPrompt(kind === "later" ? 3 : 1);
      }}
    />
  );
}
