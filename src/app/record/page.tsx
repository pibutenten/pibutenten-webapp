import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getPopularByCategory } from "@/lib/popular-keywords";
import type { KeywordPost } from "./KeywordCarousel";
import type { SummaryGroup } from "../mockups/skin-diary/SkinDiaryMockup";
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
import RecordView from "@/components/skin/record/RecordView";

/**
 * /record — 내 노트(비공개, 신규 스킨 승격 Phase 1b).
 *   신규 스킨 RecordView(베타 UI + 운영 데이터·로직)를 운영 라우트에서 직접 렌더한다.
 *   데이터 조회는 구 /beta-skin/record(page.tsx)의 서버 로직을 그대로 이식 —
 *   운영 record-data SSOT 재사용(diaries·인기글 RPC·관심 키워드 새 글). metadata 는 운영용
 *   ("내 노트" + noindex 유지, 베타 미리보기 title 제거).
 */

// BetaSkinShell·RecordView 가 클라이언트 훅(useSession 등) 사용 → 동적 렌더.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 노트",
  robots: { index: false, follow: false },
};

// /record — 내 노트(비공개). 비로그인은 가입 유도 데모, 로그인은 active 명함 기준 실데이터.
export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 게스트(비로그인) — 가입 유도 데모 + 공개 인기글로 흥미 유발.
  //    공개 인기 키워드 + 그 키워드의 최신 Q&A(공개 RLS) + 사이트 전체 인기글 3기간.
  //    인기글은 공개(published) 카드라 비로그인 노출이 적절. 단 get_top_cards_by_views 는
  //    authenticated 전용 GRANT(anon REVOKE, 마이그 0280) — anon 세션에선 권한 거부(42501)로
  //    빈 결과가 날 수 있다. buildPopularData 가 enrich 안 된 행을 거르므로 안전하게 빈 PopularData 폴백.
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

    // 게스트 키워드 새 글 + 인기글 3기간을 병렬 조회. RPC 가 anon 거부 시 data=null → buildPopularData 빈 폴백.
    const [gQaRes, gTop7Res, gTop30Res, gTop90Res] = await Promise.all([
      guestKeywords.length > 0
        ? supabase
            .from("cards")
            .select(KEYWORD_SELECT)
            .eq("category", "qa")
            .eq("status", "published")
            .is("deleted_at", null)
            .overlaps("keywords", guestKeywords)
            .order("reviewed_at", { ascending: false, nullsFirst: false })
            .limit(20)
            .returns<KeywordCardRow[]>()
        : Promise.resolve({ data: [] as KeywordCardRow[] }),
      supabase.rpc("get_top_cards_by_views", { p_days: 7, p_limit: 10 }),
      supabase.rpc("get_top_cards_by_views", { p_days: 30, p_limit: 10 }),
      supabase.rpc("get_top_cards_by_views", { p_days: 90, p_limit: 10 }),
    ]);

    const gSet = new Set(guestKeywords);
    const gNow = Date.now();
    const guestPosts: KeywordPost[] = (gQaRes.data ?? []).map((c) => toKeywordPost(c, gSet, gNow));

    // 인기글 — 회원과 동일 경로(3기간 RPC + buildPopularData). anon 권한 없으면 빈 PopularData.
    const guestPopular = await buildPopularData(
      supabase,
      (gTop7Res.data ?? []) as TopCardRow[],
      (gTop30Res.data ?? []) as TopCardRow[],
      (gTop90Res.data ?? []) as TopCardRow[],
    );

    return (
      <RecordView
        guest
        userName=""
        // 게스트는 가입 유도 히어로 + RecordView 의 빈-노트 '예시' 안내가 별도로 있으므로
        // DEMO 타임라인은 의도적으로 생략(빈 배열).
        summary={[]}
        latest={null}
        diaryCount={0}
        reviewsCount={0}
        postCount={0}
        receivedCount={0}
        keywordPosts={guestPosts}
        popular={guestPopular}
        myKeywords={guestKeywords}
      />
    );
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;

  // profiles 조회와 내 글 id 조회는 둘 다 activeId 에만 의존(서로 독립) → 한 Promise.all 로 동시 해소.
  //   - prof: 인사·관심 키워드(interests) 파생용.
  //   - myCardRows: 받은 댓글 집계(receivedCnt)용 내 모든 글 id(카테고리 무관, 삭제 제외).
  //     embedded relation 필터에 의존하지 않고 명시적 card_id IN 으로 좁혀 RLS 누수 차단.
  const [profRes, myCardRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, interested_procedures, skin_concerns, skin_type")
      .eq("id", activeId)
      .maybeSingle()
      .returns<{
        display_name: string | null;
        interested_procedures: string[] | null;
        skin_concerns: string[] | null;
        skin_type: string | null;
      }>(),
    supabase
      .from("cards")
      .select("id")
      .eq("author_id", activeId)
      .is("deleted_at", null)
      .limit(1000)
      .returns<{ id: number }[]>(),
  ]);
  const prof = profRes.data;
  const userName = prof?.display_name?.trim() || "회원";

  // 관심 키워드 합집합(관심시술 + 피부고민 + 피부타입). 카드 keywords 와 같은 한글 키(0262).
  const interests = Array.from(
    new Set([
      ...(prof?.interested_procedures ?? []),
      ...(prof?.skin_concerns ?? []),
      ...(prof?.skin_type ? [prof.skin_type] : []),
    ]),
  );

  // 받은 댓글(2단계) 1단계 — 내 모든 글 id.
  const myCardIds = (myCardRes.data ?? []).map((r) => r.id);

  // 병렬: 노트 / 내가 쓴 후기 수 / 내가 쓴 글 수 / 내 글에 달린 댓글 수 /
  //       인기글 3기간(TOP10) / 관심 키워드 새 Q&A(컴팩트, limit 20).
  const [diariesRes, reviewCntRes, postCntRes, receivedCntRes, top7Res, top30Res, top90Res, kwRes] = await Promise.all([
    supabase
      .from("diaries")
      .select(DIARY_SELECT)
      .order("visited_on", { ascending: false })
      .returns<DiaryRow[]>(),
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

  // 인기글 — 3기간 RPC + 카드 enrich(공개 카드만). deleted 제외, 조회수(cnt) 표시.
  //   가공 로직은 record-data.buildPopularData(SSOT)로 추출 — 베타 스킨과 공용.
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
