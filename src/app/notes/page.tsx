import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { DIARY_SELECT, toSummaryGroups, type DiaryRow } from "@/lib/record-data";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import RecordNotesView from "@/components/skin/record/RecordNotesView";

/**
 * /notes — 내 노트(비공개·noindex). 하단 1차 탭("내 노트").
 *   제목 + KPI 3종(받은 시술·내가 쓴 노트·내가 쓴 후기) + 시술 노트 3토글(타임라인/달력/목록).
 *   비면 KPI 밑에 "이렇게 기록돼요" 예시. 데이터는 운영 record-data SSOT(diaries → SummaryGroup[]).
 *   - 받은 시술 = 모든 노트의 diary_procedures 항목 총합(노트 1건에 시술 여러 개 가능).
 *   - 내가 쓴 후기 = active 명함이 쓴 published review 카드 수.
 */

// BetaSkinShell·RecordNotesView 가 클라이언트 훅 사용 → 동적 렌더.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 노트",
  robots: { index: false, follow: false },
};

export default async function RecordNotesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 게스트(비로그인) — 개인 노트는 없음. 빈 상태 안내(RLS 도 어차피 차단).
  if (!user) {
    return <RecordNotesView summary={[]} procedureCount={0} noteCount={0} reviewsCount={0} />;
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;

  // 회원 — active 명함 소유 diaries(RLS) + 내가 쓴 후기 수(병렬).
  const [diariesRes, reviewCntRes] = await Promise.all([
    supabase.from("diaries").select(DIARY_SELECT).order("visited_on", { ascending: false }).returns<DiaryRow[]>(),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published"),
  ]);

  const diaryRows = diariesRes.data ?? [];
  // 받은 시술 = 모든 노트의 시술 항목 총합(노트 1건에 시술 여러 개 가능).
  const procedureCount = diaryRows.reduce((n, d) => n + (d.diary_procedures?.length ?? 0), 0);
  const summary = toSummaryGroups(diaryRows) as SummaryGroup[];

  return (
    <RecordNotesView
      summary={summary}
      procedureCount={procedureCount}
      noteCount={diaryRows.length}
      reviewsCount={reviewCntRes.count ?? 0}
    />
  );
}
