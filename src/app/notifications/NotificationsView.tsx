"use client";

/**
 * NotificationsView — /notifications "알림" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): DoctorDashboardView·ProcedureReportView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 정보 구조 무변경.
 *   - 운영 NotificationsClient(2탭·필터·무한스크롤·읽음처리)를 그대로 임베드(재포장 X).
 *     데이터·권한(showOps 판정)·metadata(noindex)는 server page.tsx 가 100% 책임.
 *   - 셸은 active="마이"(알림은 마이 영역), back="/"(운영 BackButton fallback 을 셸이 렌더 —
 *     본문 내 중복 BackButton 제거), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: app.module.css 무수정. 운영 본문은 기존 Tailwind 유틸·var(--*) 토큰 그대로 사용.
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import NotificationsClient from "./NotificationsClient";

export default function NotificationsView({ showOps }: { showOps: boolean }) {
  const search = useSearchRouting();

  return (
    <AppShell
      active="마이"
      /* 2뎁스 헤더 variant(R2-3) — 구 back="/" 에서 전환: 모바일은 헤더 좌측 로고 자리
         뒤로가기, 데스크탑은 본문 뒤로 행(.backRowDesktop). 직접 진입 fallback=피드. */
      backHeader={{ fallbackHref: "/" }}
      {...search}
    >
      {/* 운영 본문 그대로 — 뒤로가기는 셸 backHeader 가 담당(본문 중복 없음). */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)]">알림</h1>
      </div>
      <NotificationsClient showOps={showOps} />
    </AppShell>
  );
}
