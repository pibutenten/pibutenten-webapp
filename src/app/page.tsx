import type { Metadata } from "next";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { cookies } from "next/headers";
import { IDENTITY_COOKIE, PRIMARY_IDENTITY_ID, UUID_RE } from "@/lib/identity-shared";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { diversifyByDoctor } from "@/lib/feed-shuffle";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = {
  // 메인 페이지 절대 title — template "피부텐텐 | %s" 우회.
  // 2026-05-20: 브랜드 + 슬로건 형태로 통일 (브라우저 탭 잘림 방지 + og:title 일관성).
  title: { absolute: "피부텐텐 | 피부가 예뻐지는 모든 이야기" },
  description:
    "피부과 전문의 9명이 직접 답하는 피부 미용 커뮤니티. 시술·홈케어·안티에이징 관련 검수된 답변 모음.",
  alternates: { canonical: `${SITE_URL}/` },
};

/**
 * 피드 페이지 — 검색창/카테고리 없이 카드만 시원하게.
 * 로고 클릭 시 진입.
 */
export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();

  // SNS-style 시간 가중치 + 인기 + doctor 가중 + jitter (lib는 0038_feed_cards_scored RPC)
  // - HALF_LIFE 14일: 14일 전 글은 가중 절반
  // - jitter ±10%: F5마다 비슷한 점수 글끼리 순서 살짝 변동
  // - doctor 글 x2: 원장 글이 일반 회원 글의 2배 가중 (회원 글 들어왔을 때 발현)
  // 풀 오버샘플 + 클라이언트 셔플은 더 이상 필요 X — DB가 score+jitter 정렬해서 줌.
  // 10번 — jitter 폭 0.2 → 0.35 (사용자: 새로고침 시 더 다양하게 보이게).
  //   feed_cards_scored RPC 가 p_jitter_amp 비율로 점수에 노이즈 추가 → 상위권 글들이
  //   F5 마다 더 자주 순서 변동. 0.35 = ±17.5% 까지 (이전 ±10%).
  const rpcRes = await supabase.rpc("feed_cards_scored", {
    p_limit: INITIAL_PAGE_SIZE,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0.35,
  });
  let cards = (rpcRes.data ?? []) as CardData[];
  const error = rpcRes.error;

  // 피드 다양화 — 첫 4카드 모두 다른 원장 + 같은 원장 3연속 방지 (lib/feed-shuffle 헬퍼)
  cards = diversifyByDoctor(cards, { maxPerDoctorInHead: 1, headSize: 4 });

  const hotIds = Array.from(await getHotQaIds(20));

  // viewer prefetch — 카드 첫 렌더 시 좋아요/저장/평점 즉시 표시
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  // 11번 — 본인이 최근 발행한 글을 피드 맨 위에 고정 (HOT 가중치 무관).
  // active profile.id (cookie) 기준 — 회원 명함으로 쓴 글은 그 active 가 작성자.
  // active 가 'primary' 면 user.id (auth) 가 author_id.
  if (viewer) {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(IDENTITY_COOKIE)?.value ?? PRIMARY_IDENTITY_ID;
    const activeId =
      cookieVal !== PRIMARY_IDENTITY_ID && UUID_RE.test(cookieVal)
        ? cookieVal
        : viewer.id;
    const { data: myLatest } = await supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("status", "published")
      .eq("author_id", activeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (myLatest) {
      // 같은 id 가 이미 cards 에 있으면 제거 후 맨 앞에 prepend.
      const myCard = myLatest as unknown as CardData;
      cards = [myCard, ...cards.filter((q) => q.id !== myCard.id)];
    }
  }
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((q) => q.id),
  );

  return (
    <section className="pt-1 sm:pt-2">
      {/* SEO/접근성 — 시각 표시는 헤더 로고가 담당, 스크린리더/봇용 H1 1개 보장 */}
      <h1 className="sr-only">
        피부텐텐 — 피부과 전문의가 답하는 피부 Q&A 라운지
      </h1>
      {error && (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Q&A 불러오기 실패: {error.message}
        </div>
      )}
      {!error && cards.length === 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          등록된 Q&A가 없습니다.
        </div>
      )}
      {!error && cards.length > 0 && (
        <Feed
          initial={cards}
          pageSize={INITIAL_PAGE_SIZE}
          hotIds={hotIds}
          viewerStates={viewerStates}
        />
      )}
    </section>
  );
}
