import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { cardHref } from "@/lib/record-data";
import MyView, { type MyActivity, type ActivityItem } from "./MyView";

/**
 * /beta-skin/my — 신규 스킨 "마이" (베타 스킨 UI + 운영 데이터·로직 재사용).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터: 운영 패턴(getIdentityContext active 명함 + RLS)을 그대로 사용해 4탭을 채운다.
 *   1) 내가 쓴 노트  = diaries (active 명함 RLS)
 *   2) 내가 쓴 후기  = cards category=review, status=published, author_id=active
 *   3) 내가 쓴 글    = cards author_id=active, not in (review, review_summary)
 *   4) 내 글에 달린 댓글 = comments JOIN cards!inner(author_id=active) AND comments.author_id != active
 *      → comments_select RLS 가 "내 글(c.author_id=active)에 달린 댓글" SELECT 를 허용(정책 검증 완료, 마이그레이션 불필요).
 *   통계 카드: 위 4종 카운트(노트·후기·글 + 받은 댓글)에서 산출.
 *
 * 비로그인: MyView 가 게스트 안내(로그인 CTA) 렌더 — 본 페이지는 빈 activity 만 전달.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 마이",
  robots: { index: false, follow: false },
};

// diaries → 노트 탭 아이템(제목=시술명 모음, sub=병원·날짜). 상세는 베타 record 로.
type DiaryItemRow = {
  id: number;
  visited_on: string;
  clinic_name: string | null;
  diary_procedures: { procedure_ko: string; sort_order: number }[];
};

// cards → 후기/글 탭 아이템.
type CardItemRow = {
  id: number;
  title: string | null;
  created_at: string | null;
  category: string | null;
  post_year: number | null;
  post_slug: string | null;
  shortcode: string | null;
  doctor: { slug: string | null } | null;
  author: { handle: string | null } | null;
};

// comments JOIN cards → 받은 댓글 탭 아이템.
type ReceivedCommentRow = {
  id: number;
  body: string | null;
  created_at: string | null;
  card: {
    id: number;
    title: string | null;
    author_id: string | null;
    post_year: number | null;
    post_slug: string | null;
    shortcode: string | null;
    doctor: { slug: string | null } | null;
    author: { handle: string | null } | null;
  } | null;
};

const CARD_ITEM_SELECT =
  "id, title, created_at, category, post_year, post_slug, shortcode, doctor:doctors(slug), author:profiles!cards_author_id_profiles_fkey(handle)";

export default async function BetaSkinMyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 비로그인 — 게스트 안내(로그인 CTA). MyView 가 activity=null 일 때 게스트 화면 렌더.
  if (!user) return <MyView />;

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;

  // 1단계 — 받은 댓글 조회의 기준이 될 "내 모든 글 id"(카테고리 무관, 삭제 제외).
  //   embedded relation 필터(.eq("card.author_id", ...))에 의존하지 않고 명시적 card_id IN 으로 좁힌다
  //   → !inner 가 "부모 존재"만 강제하고 author 필터가 무시되어 타인 글 댓글이 새는 위험 차단.
  const { data: myCardRows } = await supabase
    .from("cards")
    .select("id")
    .eq("author_id", activeId)
    .is("deleted_at", null)
    .limit(1000)
    .returns<{ id: number }[]>();
  const myCardIds = (myCardRows ?? []).map((r) => r.id);

  // 프로필(이름·아바타) + 4탭 데이터(노트·후기·글 + 받은 댓글) 병렬 조회.
  const [profRes, notesRes, reviewsRes, postsRes, receivedRes] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", activeId).maybeSingle(),
    supabase
      .from("diaries")
      .select("id, visited_on, clinic_name, diary_procedures(procedure_ko, sort_order)")
      .order("visited_on", { ascending: false })
      .limit(50)
      .returns<DiaryItemRow[]>(),
    supabase
      .from("cards")
      .select(CARD_ITEM_SELECT)
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<CardItemRow[]>(),
    supabase
      .from("cards")
      .select(CARD_ITEM_SELECT)
      .eq("author_id", activeId)
      .eq("status", "published")
      .not("category", "in", "(review,review_summary)")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<CardItemRow[]>(),
    // 2단계 — 내 글들에 달린 타인 댓글(visible). id 로 이미 좁혔으므로 inner 불필요.
    //   RLS 가 본인 글 댓글 SELECT 허용(comments_select 정책, 검증 완료).
    myCardIds.length > 0
      ? supabase
          .from("comments")
          .select(
            "id, body, created_at, card:cards(id, title, author_id, post_year, post_slug, shortcode, doctor:doctors(slug), author:profiles!cards_author_id_profiles_fkey(handle))",
          )
          .in("card_id", myCardIds)
          .neq("author_id", activeId)
          .eq("status", "visible")
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<ReceivedCommentRow[]>()
      : Promise.resolve({ data: [] as ReceivedCommentRow[] }),
  ]);

  const prof = (profRes.data ?? null) as { display_name: string | null; avatar_url: string | null; handle: string | null } | null;

  // diaries → 노트 아이템. 상세 링크는 베타 record(목록).
  const noteItems: ActivityItem[] = (notesRes.data ?? []).map((d) => {
    const procs = [...d.diary_procedures].sort((a, b) => a.sort_order - b.sort_order).map((p) => p.procedure_ko);
    const [y, m, dd] = d.visited_on.split("-");
    return {
      id: `note-${d.id}`,
      title: procs.join(" · ") || "시술 기록",
      sub: `${d.clinic_name ?? "병원 미입력"} · ${y}.${m}.${dd}`,
      href: "/beta-skin/record",
    };
  });

  const toCardItem = (c: CardItemRow): ActivityItem => ({
    id: `card-${c.id}`,
    title: c.title ?? "(제목 없음)",
    sub: c.created_at ? c.created_at.slice(0, 10) : "",
    href: cardHref(c),
  });
  const reviewItems = (reviewsRes.data ?? []).map(toCardItem);
  const postItems = (postsRes.data ?? []).map(toCardItem);

  const receivedItems: ActivityItem[] = (receivedRes.data ?? []).map((r) => {
    const card = r.card;
    const href = card
      ? cardHref({
          doctor: card.doctor ?? null,
          post_year: card.post_year,
          post_slug: card.post_slug,
          shortcode: card.shortcode,
          author: card.author ?? null,
        })
      : "/";
    return {
      id: `cmt-${r.id}`,
      title: (r.body ?? "").trim() || "(내용 없음)",
      sub: `내 글: ${card?.title ?? "삭제된 글"}`,
      href,
    };
  });

  const activity: MyActivity = {
    profileId: activeId,
    displayName: prof?.display_name?.trim() || "회원",
    avatarUrl: prof?.avatar_url ?? null,
    handle: prof?.handle ?? null,
    notes: noteItems,
    reviews: reviewItems,
    posts: postItems,
    received: receivedItems,
  };

  return <MyView activity={activity} />;
}
