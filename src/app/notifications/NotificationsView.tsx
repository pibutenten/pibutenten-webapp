"use client";

/**
 * NotificationsView — /notifications "알림" 본문 (클라이언트).
 *
 * 원칙(베타 스킨 승격, 2026-06-15): DoctorDashboardView·ProcedureReportView 선례와 동일하게
 *   "상단바(헤더)만 베타 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 NotificationsClient(2탭·필터·무한스크롤·읽음처리)를 그대로 임베드(재포장 X).
 *     데이터·권한(showOps 판정)·metadata(noindex)는 server page.tsx 가 100% 책임.
 *   - 셸은 active="마이"(알림은 마이 영역), back="/"(운영 BackButton fallback 을 셸이 렌더 —
 *     본문 내 중복 BackButton 제거), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: beta-skin.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import BetaSkinShell from "@/components/skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/components/skin/beta-ui";
import NotificationsClient from "./NotificationsClient";

export default function NotificationsView({ showOps }: { showOps: boolean }) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" back="/" {...search}>
      {/* 운영 본문 그대로 — 페이지 내 BackButton 은 셸의 back="/" 으로 대체(중복 제거). */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">알림</h1>
      </div>
      <NotificationsClient showOps={showOps} />
    </BetaSkinShell>
  );
}
