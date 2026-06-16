import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { DIARY_SELECT, toSummaryGroups, type DiaryRow } from "@/lib/record-data";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import RecordNotesView from "@/components/skin/record/RecordNotesView";
import type { MyReview } from "@/components/skin/record/RecordNotesPanel";

/* active 명함이 쓴 공개 후기(review) 카드 조회 행.
 *   - 시술명: procedure_reviews.procedure_ko (card_id 1:1) — 없으면 title 폴백.
 *   - 본문: cards.body (한줄후기). 공개 URL: /{handle}/{shortcode}. */
type ReviewCardRow = {
  id: number;
  title: string | null;
  body: string | null;
  shortcode: string | null;
  created_at: string | null;
  author: { handle: string | null } | null;
  procedure_review: { procedure_ko: string | null } | null;
};

/* review 카드 조회 SELECT — 시술명(procedure_reviews)·본문·shortcode·작성일·author.handle. */
const REVIEW_SELECT =
  "id, title, body, shortcode, created_at, author:profiles!cards_author_id_profiles_fkey(handle), procedure_review:procedure_reviews(procedure_ko)";

/**
 * /notes — 내 노트(비공개·noindex). 하단 1차 탭("내 노트").
 *   제목 + KPI 3종(받은 시술·내가 쓴 노트·내가 쓴 후기) + 시술 노트 3토글(타임라인/달력/목록).
 *   비면 KPI 밑에 "이렇게 기록돼요" 예시. 데이터는 운영 record-data SSOT(diaries → SummaryGroup[]).
 *   - 받은 시술 = 모든 노트의 diary_procedures 항목 총합(노트 1건에 시술 여러 개 가능).
 *   - 내가 쓴 후기 = active 명함이 쓴 published review 카드 수.
 */

// AppShell·RecordNotesView 가 클라이언트 훅 사용 → 동적 렌더.
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

  // 게스트(비로그인) — 개인 노트·후기 없음. 빈 상태 안내(RLS 도 어차피 차단). reviews=[] → 후기 섹션 비표시.
  if (!user) {
    return <RecordNotesView summary={[]} procedureCount={0} noteCount={0} reviewsCount={0} reviews={[]} />;
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;

  // 회원 — active 명함 소유 diaries(RLS) + 내가 쓴 공개 후기 카드(본문·시술명·링크)를 병렬 조회.
  //   후기 = cards(category='review', status='published', author_id=active). 작성일 내림차순.
  const [diariesRes, reviewsRes] = await Promise.all([
    supabase.from("diaries").select(DIARY_SELECT).order("visited_on", { ascending: false }).returns<DiaryRow[]>(),
    supabase
      .from("cards")
      .select(REVIEW_SELECT)
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .returns<ReviewCardRow[]>(),
  ]);

  const diaryRows = diariesRes.data ?? [];
  // 받은 시술 = 모든 노트의 시술 항목 총합(노트 1건에 시술 여러 개 가능).
  const procedureCount = diaryRows.reduce((n, d) => n + (d.diary_procedures?.length ?? 0), 0);
  const summary = toSummaryGroups(diaryRows) as SummaryGroup[];

  // 공개 후기 카드 → MyReview[]. 시술명은 procedure_reviews.procedure_ko, 없으면 카드 제목.
  //   공개 URL = /{handle}/{shortcode}(둘 다 있을 때만). 작성일은 "YYYY-MM-DD"로 트림.
  const reviewRows = reviewsRes.data ?? [];
  const reviews: MyReview[] = reviewRows.map((r) => ({
    id: String(r.id),
    procName: r.procedure_review?.procedure_ko || r.title || "시술 후기",
    body: r.body ?? "",
    href: r.shortcode && r.author?.handle ? `/${r.author.handle}/${r.shortcode}` : "",
    createdAt: (r.created_at ?? "").slice(0, 10),
  }));

  return (
    <RecordNotesView
      summary={summary}
      procedureCount={procedureCount}
      noteCount={diaryRows.length}
      reviewsCount={reviewRows.length}
      reviews={reviews}
    />
  );
}
