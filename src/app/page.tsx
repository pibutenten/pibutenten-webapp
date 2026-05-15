import type { Metadata } from "next";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStates } from "@/lib/viewer-states";
import { cookies } from "next/headers";

const IDENTITY_COOKIE = "pibutenten:identity";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = {
  // 메인 페이지 절대 title — template "피부텐텐 | %s" 우회.
  // v5.1: SEO·AEO 친화 핵심 키워드 (피부과 전문의·리프팅·스킨부스터·Q&A) 포함.
  title: { absolute: "피부텐텐 | 피부과 전문의가 답하는 리프팅·스킨부스터 Q&A 라운지" },
  description:
    "피부과 전문의 9명이 답하는 최신 Q&A와 칼럼. 시술·홈케어·안티에이징 관련 검수된 답변 모음.",
  alternates: { canonical: `${SITE_URL}/` },
};

/**
 * 피드 페이지 — 검색창/카테고리 없이 카드만 시원하게.
 * 로고 클릭 시 진입.
 */
export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();

  // SNS-style 시간 가중치 + 인기 + doctor 가중 + jitter (lib는 0038_feed_qas_scored RPC)
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
  let qas = (rpcRes.data ?? []) as CardData[];
  const error = rpcRes.error;

  // 첫 4카드 다양화 (검색 없으니 모두 다른 원장)
  if (qas.length > 4) {
    const counts = new Map<string, number>();
    const head: CardData[] = [];
    const tail: CardData[] = [];
    for (const it of qas) {
      const slug = it.doctor?.slug ?? "_unknown";
      const c = counts.get(slug) ?? 0;
      if (head.length < 4 && c < 1) {
        head.push(it);
        counts.set(slug, c + 1);
      } else {
        tail.push(it);
      }
    }
    qas = [...head, ...tail];
  }

  // 같은 원장 3연속 방지
  if (qas.length >= 3) {
    const remaining = [...qas];
    const reordered: CardData[] = [];
    while (remaining.length > 0) {
      const last = reordered[reordered.length - 1];
      const prev = reordered[reordered.length - 2];
      const lastTwoSameSlug =
        last !== undefined &&
        prev !== undefined &&
        last.doctor?.slug !== undefined &&
        last.doctor?.slug === prev.doctor?.slug;
      if (lastTwoSameSlug) {
        const idx = remaining.findIndex(
          (it) => it.doctor?.slug !== last.doctor?.slug,
        );
        if (idx >= 0) {
          reordered.push(remaining.splice(idx, 1)[0]);
          continue;
        }
      }
      reordered.push(remaining.shift() as CardData);
    }
    qas = reordered;
  }

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
    const cookieVal = cookieStore.get(IDENTITY_COOKIE)?.value ?? "primary";
    const activeId =
      cookieVal !== "primary" && UUID_RE.test(cookieVal) ? cookieVal : viewer.id;
    const { data: myLatest } = await supabase
      .from("cards")
      .select(
        "id, type, category, question, answer, meta, keywords, like_count, view_count, save_count, share_count, rating_avg, rating_count, post_year, post_slug, external_url, external_title, external_description, external_image, external_site_name, hide_doctor_credential, shortcode, pubmed_ref, created_at, doctor:doctors(id, slug, name, title, clinic, branch, profile_data, primary_color, accent_color), author:profiles!author_id(id, display_name, avatar_url, handle, role)",
      )
      .eq("status", "published")
      .eq("author_id", activeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (myLatest) {
      // 같은 id 가 이미 qas 에 있으면 제거 후 맨 앞에 prepend.
      const myCard = myLatest as unknown as CardData;
      qas = [myCard, ...qas.filter((q) => q.id !== myCard.id)];
    }
  }
  const viewerStateMap = await fetchViewerStates(
    supabase,
    viewer?.id ?? null,
    qas.map((q) => q.id),
  );
  const viewerStates: Record<number, { liked?: boolean; saved?: boolean; rating?: number }> = {};
  for (const [id, state] of viewerStateMap) viewerStates[id] = state;

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
      {!error && qas.length === 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          등록된 Q&A가 없습니다.
        </div>
      )}
      {!error && qas.length > 0 && (
        <Feed
          initial={qas}
          pageSize={INITIAL_PAGE_SIZE}
          hotIds={hotIds}
          viewerStates={viewerStates}
        />
      )}
    </section>
  );
}
