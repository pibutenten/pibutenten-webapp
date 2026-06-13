import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getPopularByCategory } from "@/lib/popular-keywords";
import type { KeywordPost } from "@/app/record/KeywordCarousel";
import type { SummaryGroup } from "@/app/mockups/skin-diary/SkinDiaryMockup";
import {
  KEYWORD_SELECT,
  DIARY_SELECT,
  toSummaryGroups,
  toKeywordPost,
  buildPopularData,
  type KeywordCardRow,
  type DiaryRow,
  type TopCardRow,
} from "@/lib/record-data";
import RecordView from "./RecordView";

/**
 * /beta-skin/record — 신규 스킨 "내 노트" (베타 스킨 UI + 운영 데이터·로직 재사용).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터: 운영 /record(page.tsx)와 동일한 조회·매핑(record-data SSOT)을 사용한다.
 *   - 시술 노트: diaries + diary_procedures → toSummaryGroups(SummaryGroup[]). RLS active 명함 소유분.
 *   - 인기글: get_top_cards_by_views 7/30/90일 각 TOP10 → buildPopularData(PopularData).
 *   - 관심 키워드 새 글: interests(관심시술+피부고민+피부타입) overlaps + KEYWORD_SELECT, limit 20.
 *   - 히어로 상태: computeStatus(latest)는 RecordView(클라)에서 계산.
 *   - 비로그인: 가입 유도 데모 — 공개 인기 키워드 + 그 키워드 최신 Q&A(공개 RLS)만 예시 노출.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 내 노트",
  robots: { index: false, follow: false },
};

export default async function BetaSkinRecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 게스트(비로그인) — 가입 유도 데모. 인기글 RPC(authenticated 전용)는 호출하지 않고,
  //    공개 인기 키워드 + 그 키워드의 최신 Q&A(공개 RLS)만 예시로 노출(운영 /record 정합).
  if (!user) {
    const popularByCat = await getPopularByCategory().catch(() => null);
    const guestKeywords = popularByCat
      ? Array.from(
          new Set([
            ...popularByCat.lifting.slice(0, 4),
            ...popularByCat.injectables.slice(0, 4),
            ...popularByCat.concerns.slice(0, 3),
          ]),
        ).slice(0, 10)
      : [];
    let guestPosts: KeywordPost[] = [];
    if (guestKeywords.length > 0) {
      const { data: qaRows } = await supabase
        .from("cards")
        .select(KEYWORD_SELECT)
        .eq("category", "qa")
        .eq("status", "published")
        .is("deleted_at", null)
        .overlaps("keywords", guestKeywords)
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(20)
        .returns<KeywordCardRow[]>();
      const gSet = new Set(guestKeywords);
      const gNow = Date.now();
      guestPosts = (qaRows ?? []).map((c) => toKeywordPost(c, gSet, gNow));
    }
    return (
      <RecordView
        guest
        userName=""
        // 게스트는 가입 유도 히어로 + RecordView 의 빈-노트 '예시' 안내가 별도로 있으므로
        // 운영 DEMO_SUMMARY(예시 타임라인)는 의도적으로 생략(빈 배열). DEMO 복원은 선택 사항.
        summary={[]}
        latest={null}
        diaryCount={0}
        reviewsCount={0}
        postCount={0}
        receivedCount={0}
        keywordPosts={guestPosts}
        popular={{ d7: [], d30: [], d90: [] }}
        myKeywords={guestKeywords}
      />
    );
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, interested_procedures, skin_concerns, skin_type")
    .eq("id", activeId)
    .maybeSingle()
    .returns<{
      display_name: string | null;
      interested_procedures: string[] | null;
      skin_concerns: string[] | null;
      skin_type: string | null;
    }>();
  const userName = prof?.display_name?.trim() || "회원";

  // 관심 키워드 합집합(관심시술 + 피부고민 + 피부타입). 카드 keywords 와 같은 한글 키(0262).
  const interests = Array.from(
    new Set([
      ...(prof?.interested_procedures ?? []),
      ...(prof?.skin_concerns ?? []),
      ...(prof?.skin_type ? [prof.skin_type] : []),
    ]),
  );

  // 받은 댓글(2단계) 1단계 — 내 모든 글 id(카테고리 무관, 삭제 제외). my/page.tsx 패턴 재사용.
  //   embedded relation 필터에 의존하지 않고 명시적 card_id IN 으로 좁혀 RLS 누수 차단.
  const { data: myCardRows } = await supabase
    .from("cards")
    .select("id")
    .eq("author_id", activeId)
    .is("deleted_at", null)
    .limit(1000)
    .returns<{ id: number }[]>();
  const myCardIds = (myCardRows ?? []).map((r) => r.id);

  // 병렬: 노트 / 내가 쓴 후기 수 / 내가 쓴 글 수 / 내 글에 달린 댓글 수 /
  //       인기글 3기간(TOP10) / 관심 키워드 새 Q&A(컴팩트, limit 20).
  const [diariesRes, reviewCntRes, postCntRes, receivedCntRes, top7Res, top30Res, top90Res, kwRes] = await Promise.all([
    supabase.from("diaries").select(DIARY_SELECT).order("visited_on", { ascending: false }).returns<DiaryRow[]>(),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published"),
    // 내가 쓴 글 수 — 후기·리포트 제외(글쓰기 목록과 동일 정책), published.
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("status", "published")
      .not("category", "in", "(review,review_summary)"),
    // 내 글에 달린 댓글 수(2단계) — 내 글 id 로 좁히고 타인(active 외) visible 댓글만.
    //   RLS 가 본인 글 댓글 SELECT 허용(comments_select 정책, my/page.tsx 검증 완료).
    myCardIds.length > 0
      ? supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("card_id", myCardIds)
          .neq("author_id", activeId)
          .eq("status", "visible")
      : Promise.resolve({ count: 0 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 7, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 30, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 90, p_limit: 10 }),
    interests.length > 0
      ? supabase
          .from("cards")
          .select(KEYWORD_SELECT)
          .eq("category", "qa")
          .eq("status", "published")
          .is("deleted_at", null)
          .overlaps("keywords", interests)
          .order("reviewed_at", { ascending: false, nullsFirst: false })
          .limit(20)
          .returns<KeywordCardRow[]>()
      : Promise.resolve({ data: [] as KeywordCardRow[] }),
  ]);

  const rows = diariesRes.data ?? [];
  const reviewsCount = reviewCntRes.count ?? 0;
  const postCount = postCntRes.count ?? 0;
  const receivedCount = receivedCntRes.count ?? 0;

  // 상태 문구 계산용 — 가장 최근 방문의 첫 시술명 + 방문일 + 그 시술 누적 횟수('N회차').
  const latestRow = rows[0];
  const latestName =
    latestRow && ([...latestRow.diary_procedures].sort((a, b) => a.sort_order - b.sort_order)[0]?.procedure_ko ?? "시술");
  const latest = latestRow
    ? {
        name: latestName as string,
        visitedOn: latestRow.visited_on,
        count: rows.filter((r) => r.diary_procedures.some((p) => p.procedure_ko === latestName)).length,
      }
    : null;

  // 관심 키워드 새 Q&A(컴팩트 카드). NEW=24h. 원장 글은 doctor 사진, 회원 글은 author 아바타.
  const interestSet = new Set(interests);
  const now = Date.now();
  const keywordPosts: KeywordPost[] = ((kwRes.data ?? []) as KeywordCardRow[]).map((c) =>
    toKeywordPost(c, interestSet, now),
  );

  // 인기글 — 3기간 RPC + 카드 enrich(공개 카드만). record-data.buildPopularData(SSOT, 운영 공용).
  const popular = await buildPopularData(
    supabase,
    (top7Res.data ?? []) as TopCardRow[],
    (top30Res.data ?? []) as TopCardRow[],
    (top90Res.data ?? []) as TopCardRow[],
  );

  return (
    <RecordView
      userName={userName}
      summary={toSummaryGroups(rows) as SummaryGroup[]}
      latest={latest}
      diaryCount={rows.length}
      reviewsCount={reviewsCount}
      postCount={postCount}
      receivedCount={receivedCount}
      keywordPosts={keywordPosts}
      popular={popular}
      myKeywords={interests}
    />
  );
}
