import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { getPopularByCategory } from "@/lib/popular-keywords";
import type { KeywordPost } from "./KeywordCarousel";
import {
  KEYWORD_SELECT,
  DIARY_SELECT,
  toKeywordPost,
  buildPopularData,
  type KeywordCardRow,
  type DiaryRow,
  type TopCardRow,
} from "@/lib/record-data";
import RecordView from "@/components/skin/record/RecordView";

/**
 * /today — 투데이(비공개). 하단 1차 탭.
 *   RecordView 렌더: 날씨 → 인사 히어로 → 나만의 피부기록(최근 노트 1건) → KPI 4종 →
 *   관심 키워드 새 글 → 인기글. 데이터는 운영 record-data SSOT 재사용
 *   (diaries·인기글 RPC·관심 키워드 새 글). metadata: "투데이" + noindex.
 */

// AppShell·RecordView 가 클라이언트 훅(useSession 등) 사용 → 동적 렌더.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "투데이",
  robots: { index: false, follow: false },
};

// /today — 투데이(비공개). 비로그인은 가입 유도 데모, 로그인은 active 명함 기준 실데이터.
export default async function TodayPage() {
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
            ...popularByCat.skinbooster.slice(0, 4),
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
        latest={null}
        diaryCount={0}
        reviewsCount={0}
        postCount={0}
        commentCount={0}
        keywordPosts={guestPosts}
        popular={guestPopular}
        myKeywords={guestKeywords}
      />
    );
  }

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;

  // prof — 인사·관심 키워드(interests) 파생용 + KPI 타일 프로필 링크용 handle. activeId(active 명함) 기준.
  const { data: prof } = await supabase
    .from("profiles")
    .select("handle, display_name, interested_procedures, skin_concerns, skin_type")
    .eq("id", activeId)
    .maybeSingle()
    .returns<{
      handle: string | null;
      display_name: string | null;
      interested_procedures: string[] | null;
      skin_concerns: string[] | null;
      skin_type: string | null;
    }>();
  const userName = prof?.display_name?.trim() || "회원";
  // KPI 타일 /{handle}?tab=... 링크용 — /my(마이페이지 허브)와 동일 폴백(prof → active 명함).
  //   미설정이면 null → RecordView 가 프로필행 타일을 비링크 폴백 처리.
  const handle = prof?.handle ?? idCtx?.active?.handle ?? null;

  // 관심 키워드 합집합(관심시술 + 피부고민 + 피부타입). 카드 keywords 와 같은 한글 키(0262).
  const interests = Array.from(
    new Set([
      ...(prof?.interested_procedures ?? []),
      ...(prof?.skin_concerns ?? []),
      ...(prof?.skin_type ? [prof.skin_type] : []),
    ]),
  );

  // 병렬: 노트 / 내가 쓴 후기 수 / 내가 쓴 글 수 / 내가 쓴 댓글 수 /
  //       인기글 3기간(TOP10) / 관심 키워드 새 Q&A(컴팩트, limit 20).
  const [diariesRes, reviewCntRes, postCntRes, commentCntRes, top7Res, top30Res, top90Res, kwRes] = await Promise.all([
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
    // 내가 쓴 댓글 수 — active 명함이 작성한 visible 댓글(어느 글이든).
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("status", "visible"),
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
  const commentCount = commentCntRes.count ?? 0;

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
  //   가공 로직은 record-data.buildPopularData(SSOT)로 추출 — 앱 스킨과 공용.
  const popular = await buildPopularData(
    supabase,
    (top7Res.data ?? []) as TopCardRow[],
    (top30Res.data ?? []) as TopCardRow[],
    (top90Res.data ?? []) as TopCardRow[],
  );

  return (
    <RecordView
      userName={userName}
      handle={handle}
      latest={latest}
      diaryCount={rows.length}
      reviewsCount={reviewsCount}
      postCount={postCount}
      commentCount={commentCount}
      keywordPosts={keywordPosts}
      popular={popular}
      myKeywords={interests}
    />
  );
}
