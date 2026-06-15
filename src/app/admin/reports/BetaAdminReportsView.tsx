"use client";

/**
 * BetaAdminReportsView — /admin/reports "신고 검토" 본문 (베타 셸 래퍼).
 *
 * 원칙(Phase 3 ②): 상단 바·배경만 베타 셸(BetaSkinShell)로 통일하고,
 *   본문 골격(헤더 + 운영 액션 컴포넌트 ReportsClient)은 그대로 임베드한다.
 *   - 데이터 fetch·가드는 서버 page.tsx 가 담당하고, enriched row·label 맵을 props 로 내려준다.
 *   - ReportsClient(운영 클라 액션 컴포넌트)는 로직 무수정 import 임베드.
 *   - 제목·설명 영역만 베타 톤(var(--ink-*)) 으로 재조정, 본문은 운영 컴포넌트 그대로.
 *
 * 격리: 운영 ReportsClient 무수정. 내부 링크는 모두 /admin/* (베타 라우트 미사용).
 */

import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";
import ReportsClient from "./ReportsClient";
import type { AdminReportRowEnriched } from "./page";

type Props = {
  rows: AdminReportRowEnriched[];
  reasonLabel: Record<string, string>;
  statusLabel: Record<string, string>;
  pendingCount: number;
  totalCount: number;
};

export default function BetaAdminReportsView({
  rows,
  reasonLabel,
  statusLabel,
  pendingCount,
  totalCount,
}: Props) {
  const search = useBetaSearchRouting();

  return (
    <BetaSkinShell active="마이" wide back="/admin" {...search}>
      {/* 제목 + noindex 설명 (베타 톤) */}
      <div style={{ marginBottom: 20, paddingLeft: 4 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink-900)",
            margin: 0,
          }}
        >
          신고 검토
        </h1>
        <p
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--ink-500)",
          }}
        >
          대기 {pendingCount}건 / 전체 {totalCount}건 (최근 200건) — 숨김은 영구
          비공개(복구가능), 완전삭제는 soft-delete 익명화(카드 한정).
        </p>
      </div>

      {/* 운영 액션 컴포넌트 — 로직 무수정 임베드 */}
      <ReportsClient
        rows={rows}
        reasonLabel={reasonLabel}
        statusLabel={statusLabel}
      />
    </BetaSkinShell>
  );
}
