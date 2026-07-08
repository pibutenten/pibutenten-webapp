"use client";

/**
 * ReportShareButtons — 리포트 상세 전용 저장·공유 2버튼 (데스크탑 사이드바 푸터).
 *
 * ReportsShell 이 상세 경로일 때만 사이드바 푸터(ReportsIndexSidebar footer prop)로 내려준다.
 *
 * 2026-07-08 Phase 2-4 (D5 재배선): 구현이 "링크 클립보드 복사"였던 것을 히어로·하단 고정 바와
 * **동일한 진짜 배선**(앵커 카드 useCardEngagement — toggle_card_save RPC = card_saves ·
 * card_shares INSERT)으로 교체 — 기기별 저장 동작 불일치 방지.
 *
 * 앵커(report.anchor)는 page 데이터라 layout 계층(ReportsShell)에서 직접 접근 불가 →
 * ReportsDetailView 가 마운트 시 `setReportAnchorCard()` 로 발행하는 **모듈 스토어**를
 * useSyncExternalStore 로 구독한다(같은 클라 트리 — context 추가 배선 없이 최소 결선).
 * 앵커 없는 리포트는 저장 비노출(대상 card_id 부재), 공유만 URL 공유 폴백으로 유지.
 */

import { useState, useSyncExternalStore } from "react";
import type { CardData } from "@/components/Card";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";
import { shareCard } from "@/components/card/utils/card-share";
import { useSession } from "@/lib/session-context";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { showToast } from "@/lib/toast";
import { IconShare } from "@/components/icons";

/* ---------- 앵커 모듈 스토어 (ReportsDetailView → 이 컴포넌트) ---------- */

let anchorCard: CardData | null = null;
const listeners = new Set<() => void>();

/** 리포트 상세 뷰가 마운트/언마운트 시 호출 — 사이드바 푸터가 같은 앵커로 배선되게 발행. */
export function setReportAnchorCard(card: CardData | null) {
  anchorCard = card;
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): CardData | null {
  return anchorCard;
}
function getServerSnapshot(): CardData | null {
  return null;
}

const BTN =
  "flex items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]";

function BookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
/* 공유 아이콘은 공용 모듈(IconShare)로 통일 — 하단 고정 바(ReportsDetailView)와 동일 형상
   (최종 검수 A 지적: 인라인 중복 정의 제거). stroke 는 버튼 글자색을 따르게 currentColor. */
const SHARE_GLYPH = <IconShare size={16} stroke="currentColor" />;

/** 앵커 있는 리포트 — 진짜 북마크(card_saves) + 공유(card_shares). */
function AnchorButtons({ anchor }: { anchor: CardData }) {
  const session = useSession();
  const me: EngagementMe =
    session === null ? null : { id: session.activeIdentityId, role: session.role };
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const eng = useCardEngagement(anchor, {}, me, setAuthPrompt, shareCard);

  return (
    <>
      <div className="flex justify-center gap-2.5">
        <button
          type="button"
          onClick={eng.save.toggle}
          aria-pressed={eng.save.active}
          className={BTN}
        >
          <BookmarkGlyph filled={eng.save.active} />
          {eng.save.active ? "저장됨" : "저장하기"}
        </button>
        <button type="button" onClick={() => void eng.share.share()} className={BTN}>
          {SHARE_GLYPH}
          공유하기
        </button>
      </div>
      <LoginPromptDialog
        open={!!authPrompt}
        message={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </>
  );
}

/** 앵커 없는 리포트(미발행) — 저장 비노출, URL 공유만(종전 동작 유지). */
function UrlShareOnly() {
  async function share() {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: document.title, url });
        return;
      } catch {
        /* 취소/미지원 — 클립보드 폴백 */
      }
    }
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("링크가 복사됐어요.");
  }
  return (
    <div className="flex justify-center gap-2.5">
      <button type="button" onClick={() => void share()} className={BTN}>
        {SHARE_GLYPH}
        공유하기
      </button>
    </div>
  );
}

export default function ReportShareButtons() {
  const anchor = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // key=anchor.id — 시술 간 이동 시 훅 상태(저장 낙관값)를 리셋해 이전 앵커 상태 잔존 방지.
  if (anchor) return <AnchorButtons key={anchor.id} anchor={anchor} />;
  return <UrlShareOnly />;
}
