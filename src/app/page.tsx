import type { Metadata } from "next";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = {
  // 메인 페이지 절대 title — template "피부텐텐 | %s" 우회.
  // 2026-05-20: 브랜드 + 슬로건 형태로 통일 (브라우저 탭 잘림 방지 + og:title 일관성).
  title: { absolute: "피부텐텐 | 피부가 예뻐지는 모든 이야기" },
  description:
    "피부과 전문의가 직접 답하는 피부 미용 커뮤니티. 시술·홈케어·안티에이징 관련 검수된 답변 모음.",
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

  // "방금 쓴 글" 1회 노출은 <Feed enableJustPublished /> 가 담당 (그리드 첫 칸에 편입).
  //   정책: publish 후 5분 이내 + 본인 명의 + sessionStorage 1회 노출 → 'shown' 마킹.
  //   클라이언트 전용 — 다른 사용자·SEO 영향 0.

  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((q) => q.id),
  );

  // JSON-LD: 홈 페이지는 그룹 브랜드의 메인 진입점 — 5개 지점 MedicalClinic + 그룹 풀세트.
  // layout.tsx 가 가진 Organization/WebSite/그룹법인 외에 추가로 inject.
  const clinicsJsonLd = {
    "@context": "https://schema.org",
    "@graph": allClinicsSchema(),
  };

  return (
    <section className="pt-1 sm:pt-2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(clinicsJsonLd) }}
      />
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
          enableJustPublished
        />
      )}
    </section>
  );
}
