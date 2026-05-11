import type { Metadata } from "next";
import Feed from "@/components/Feed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStates } from "@/lib/viewer-states";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = {
  // 메인 페이지 절대 title — template "피부텐텐 | %s" 우회.
  // v5.1: SEO·AEO 친화 핵심 키워드 (피부과 전문의·리프팅·스킨부스터·Q&A) 포함.
  title: { absolute: "피부텐텐 | 피부과 전문의가 답하는 리프팅 · 스킨부스터 Q&A 라운지" },
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

  const rpcRes = await supabase.rpc("search_qas_scored", {
    p_q: "",
    p_doctor_slug: null,
    p_offset: 0,
    p_limit: INITIAL_PAGE_SIZE,
    p_boost_doctor_slug: null,
  });
  let qas = (rpcRes.data ?? []) as QACardData[];
  const error = rpcRes.error;

  // 첫 4카드 다양화 (검색 없으니 모두 다른 원장)
  if (qas.length > 4) {
    const counts = new Map<string, number>();
    const head: QACardData[] = [];
    const tail: QACardData[] = [];
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
    const reordered: QACardData[] = [];
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
      reordered.push(remaining.shift() as QACardData);
    }
    qas = reordered;
  }

  const hotIds = Array.from(await getHotQaIds(20));

  // viewer prefetch — 카드 첫 렌더 시 좋아요/저장/평점 즉시 표시
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerStateMap = await fetchViewerStates(
    supabase,
    viewer?.id ?? null,
    qas.map((q) => q.id),
  );
  const viewerStates: Record<number, { liked?: boolean; saved?: boolean; rating?: number }> = {};
  for (const [id, state] of viewerStateMap) viewerStates[id] = state;

  return (
    <section className="pt-1 sm:pt-2">
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
