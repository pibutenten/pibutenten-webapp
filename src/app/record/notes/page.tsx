import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DIARY_SELECT, toSummaryGroups, type DiaryRow } from "@/lib/record-data";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import RecordNotesView from "@/app/beta-skin/record/RecordNotesView";

/**
 * /record/notes — 내 시술노트 "자세히"(비공개·noindex).
 *   내 노트(/record) 시술 노트 섹션의 '자세히' → 진입. 3토글(타임라인/달력/목록) 전체를
 *   새 페이지에서 본다(날씨 /record/weather 패턴 동일). 데이터는 운영 record-data SSOT
 *   (diaries → SummaryGroup[]) 재사용 — /record/page.tsx 의 diaries 조회와 동일.
 */

// BetaSkinShell·RecordNotesView 가 클라이언트 훅 사용 → 동적 렌더.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술노트",
  robots: { index: false, follow: false },
};

export default async function RecordNotesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 게스트(비로그인) — 개인 노트는 없음. 빈 상태 안내(RLS 도 어차피 차단).
  if (!user) {
    return <RecordNotesView summary={[]} />;
  }

  // 회원 — active 명함 소유 diaries 만(RLS). /record/page.tsx 와 동일한 SELECT·정렬·매핑.
  const { data: diaryRows } = await supabase
    .from("diaries")
    .select(DIARY_SELECT)
    .order("visited_on", { ascending: false })
    .returns<DiaryRow[]>();

  const summary = toSummaryGroups(diaryRows ?? []) as SummaryGroup[];
  return <RecordNotesView summary={summary} />;
}
