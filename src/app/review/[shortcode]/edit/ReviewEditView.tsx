"use client";

/**
 * ReviewEditView — /review/{shortcode}/edit "시술후기 수정" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): WriteView·DoctorDashboardView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 작성 폼 로직 무변경.
 *   - 운영 ReviewForm(mode='edit', 시술 잠금 + 정량값 프리필)을 그대로 임베드(셸만 입힘).
 *     카드/정량값 로드·소유권 가드·404 처리는 server page.tsx 가 100% 책임.
 *   - 셸은 active="글쓰기"(후기 수정은 글쓰기 영역), back(기본 fallback "/" — 카드 ⋮·관리자 등
 *     진입 경로가 다양하므로 직접 진입 시 홈), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: app.module.css 무수정. ReviewForm 내부 로직·디자인은 무수정.
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import ReviewForm, {
  type ProcedureOption,
  type ReviewEditInitial,
} from "@/app/review/new/ReviewForm";

export default function ReviewEditView({
  procedures,
  handle,
  shortcode,
  initial,
}: {
  procedures: ProcedureOption[];
  handle: string;
  shortcode: string;
  initial: ReviewEditInitial;
}) {
  const search = useSearchRouting();

  return (
    <AppShell active="글쓰기" back {...search}>
      {/* 운영 ReviewForm(mode='edit') 그대로 — 셸만 입힘(내부 폼 로직 무수정). */}
      <ReviewForm
        procedures={procedures}
        handle={handle}
        mode="edit"
        shortcode={shortcode}
        initial={initial}
      />
    </AppShell>
  );
}
