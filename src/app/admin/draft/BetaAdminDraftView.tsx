"use client";

/**
 * BetaAdminDraftView — /admin/draft "새 Q&A 추출하기" 본문 (베타 셸 래퍼).
 *
 * 원칙(Phase 3 ②): 상단 바·배경만 베타 셸(BetaSkinShell)로 통일하고,
 *   본문 골격(헤더 + 운영 위저드 DraftClient)은 그대로 임베드한다.
 *   - 데이터 fetch 없는 단순 페이지라 서버 page.tsx 의 가드 통과 후 이 래퍼만 렌더한다.
 *   - DraftClient(운영 클라 위저드)는 로직 무수정 import 임베드.
 *   - 제목 영역만 베타 톤(var(--ink-*)) 으로 재조정, 본문은 운영 컴포넌트 그대로.
 *
 * 격리: 운영 DraftClient 무수정. 내부 링크는 모두 /admin/* (베타 라우트 미사용).
 */

import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";
import DraftClient from "./DraftClient";

export default function BetaAdminDraftView() {
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
          새 Q&A 추출하기
        </h1>
      </div>

      {/* 운영 위저드 — 로직 무수정 임베드 */}
      <DraftClient />
    </BetaSkinShell>
  );
}
