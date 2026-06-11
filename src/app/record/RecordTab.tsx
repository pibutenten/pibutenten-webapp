"use client";

import { useRouter } from "next/navigation";
// 우리 목업의 내 일기(연표/달력/목록) 컴포넌트를 그대로 재사용.
//   데이터는 서버(page.tsx)에서 조회한 실제 diaries(SummaryGroup[])를 prop 으로 받음.
//   항목 클릭 → /record/[id] 상세 라우트로 이동.
import { RecordView, type SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";

export default function RecordTab({ summary }: { summary: SummaryGroup[] }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[680px]">
      <RecordView go={() => {}} summary={summary} openDetail={(id) => router.push(`/record/${id}`)} />
    </div>
  );
}
