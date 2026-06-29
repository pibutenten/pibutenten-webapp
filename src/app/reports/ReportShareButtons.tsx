"use client";

/**
 * ReportShareButtons — 리포트 상세 전용 저장·공유 2버튼.
 *
 * ReportsDetailView 본문에 있던 저장/공유 블록을 추출해, ReportsShell 이 상세 경로일 때만
 * 사이드바 푸터(ReportsIndexSidebar 의 footer prop)로 내려준다.
 *
 *   - 저장: 현재 페이지 링크를 클립보드에 복사 + 토스트(즐겨찾기 안내).
 *   - 공유: navigator.share 가능 시 네이티브 공유 시트, 아니면 클립보드 복사 + 토스트.
 *
 * ko/url prop 불필요 — window.location · document.title 로 현재 페이지를 그대로 사용한다.
 * window/navigator 가드(typeof)로 SSR 안전.
 */

import { showToast } from "@/lib/toast";

const BTN =
  "flex items-center justify-center gap-2.5 rounded-[var(--radius)] bg-[var(--primary)] px-7 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]";

export default function ReportShareButtons() {
  function saveReport() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    showToast("링크를 복사했어요. 즐겨찾기에 저장해 두세요.");
  }

  async function share() {
    if (typeof navigator === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
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
      <button type="button" onClick={saveReport} className={BTN}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        리포트 저장
      </button>
      <button type="button" onClick={share} className={BTN}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
        공유
      </button>
    </div>
  );
}
