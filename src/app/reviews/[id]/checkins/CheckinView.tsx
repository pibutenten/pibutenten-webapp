"use client";

/**
 * CheckinView — /reviews/{id}/checkins "시점별 체크인" 본문 (클라이언트).
 *
 * 원칙(앱 스킨 승격): ReviewEditView 선례와 동일하게 "상단바(헤더)만 앱 셸, 본문은
 *   기존 후기 폼 톤 유지". 카드/소유권 가드·404·prefill 로드는 server page.tsx 가 100% 책임.
 *   - 셸은 active="글쓰기"(후기 입력 영역), back(기본 fallback "/"), 검색은 운영 홈(/?q=).
 *   - 본문은 CheckinForm(시점 맥락 글상자) 임베드.
 */

import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import CheckinForm from "./CheckinForm";
import type { CheckinTimepoint, CheckinPrefill } from "./checkin-shared";
import type { ShortAnswerQuestion } from "@/components/review/ShortAnswerFields";

export default function CheckinView({
  reviewId,
  timepoint,
  procedureKo,
  prefill,
  shortAnswerQuestions,
  diaryId,
}: {
  reviewId: number;
  timepoint: CheckinTimepoint;
  procedureKo: string | null;
  prefill: CheckinPrefill;
  shortAnswerQuestions?: ShortAnswerQuestion[];
  diaryId?: number | null;
}) {
  const search = useSearchRouting();

  return (
    <AppShell
      active="글쓰기"
      /* 2뎁스 헤더 variant(R2-3) — 구 back(plain, 기본 fallback "/")에서 전환. CheckinForm 은
         이탈 가드(useUnsavedChangesGuard) 미사용 폼이라 plain 뒤로가기 전환에 입력 유실 가드 우회 없음. */
      backHeader={{ fallbackHref: "/" }}
      {...search}
    >
      <CheckinForm
        reviewId={reviewId}
        timepoint={timepoint}
        procedureKo={procedureKo}
        prefill={prefill}
        shortAnswerQuestions={shortAnswerQuestions}
        diaryId={diaryId}
      />
    </AppShell>
  );
}
