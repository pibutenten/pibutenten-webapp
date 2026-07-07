"use client";

/**
 * ReviewNewView — /review/new "시술후기 작성" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격, 2026-06-15): WriteView·DoctorDashboardView 선례와 동일하게
 *   "상단바(헤더)만 앱 셸, 본문은 기존 운영 형태를 최대한 유지". 작성 폼 로직 무변경.
 *   - 운영 ReviewForm(시술 선택·만족도·통증·재시술·효과·한줄후기)을 그대로 임베드(셸만 입힘).
 *     데이터(시술 선택지)·권한 가드(로그인/active 명함)·metadata(noindex)는 server page.tsx 가 책임.
 *   - 셸은 active="글쓰기"(후기는 글쓰기 영역), back="/write"(운영 BackButton fallback 을 셸이 렌더 —
 *     직접 진입 시 글쓰기 허브로), 검색은 운영 홈(/?q=)으로 라우팅.
 *
 * 격리: app.module.css 무수정. ReviewForm 내부 로직·디자인은 무수정(globals.css 토큰 그대로).
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import ReviewForm, { type ProcedureOption } from "./ReviewForm";
import type { ShortAnswerQuestion } from "@/components/review/ShortAnswerFields";

export default function ReviewNewView({
  procedures,
  handle,
  initialProcedure,
  shortAnswerQuestions,
  visitId,
  diaryProcedureId,
}: {
  procedures: ProcedureOption[];
  handle: string;
  initialProcedure?: string;
  shortAnswerQuestions?: ShortAnswerQuestion[];
  // 노트↔후기 연결(2c) — server 가 소유 검증한 방문·시술. 폼이 제출 payload 에 담아 전달.
  visitId?: number;
  diaryProcedureId?: number;
}) {
  const search = useSearchRouting();

  return (
    <AppShell active="글쓰기" back="/write" {...search}>
      {/* 운영 ReviewForm 그대로 — 셸만 입힘(내부 폼 로직 무수정). */}
      <ReviewForm
        procedures={procedures}
        handle={handle}
        initialProcedure={initialProcedure}
        shortAnswerQuestions={shortAnswerQuestions}
        visitId={visitId}
        diaryProcedureId={diaryProcedureId}
      />
    </AppShell>
  );
}
