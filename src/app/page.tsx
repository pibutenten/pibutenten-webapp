import type { Metadata } from "next";
import { headers } from "next/headers";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHotQaIds } from "@/lib/hot-ids";
import { SITE_URL } from "@/lib/site";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { diversifyByDoctor } from "@/lib/feed-shuffle";
import { getReviewSummaryFeedPool } from "@/lib/procedure-report";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const INITIAL_PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  // 홈만 brand-first(absolute, 템플릿 미적용). description 의 전문의 수(D)는 라이브 동적.
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("doctors")
    .select("id", { count: "exact", head: true });
  const d = count ?? 0;
  const title = "피부텐텐 | 피부가 예뻐지는 모든 이야기";
  const description = `피부과 전문의 ${d}명이 리프팅·스킨부스터·안티에이징 시술 질문에 직접 답합니다. 시술별 후기 집계까지.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/` },
    openGraph: { title, description, url: `${SITE_URL}/`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * 피드 페이지 — 검색창/카테고리 없이 카드만 시원하게.
 * 로고 클릭 시 진입.
 */
export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();

  // CLS 수정(2026-06-07): react-masonry-css 는 SSR 에 window 가 없어 breakpointCols.default(2)
  //   로 렌더 → 모바일 클라가 1컬럼으로 재배치하며 피드 전체가 점프(CLS). 홈은 동적 라우트라
  //   요청 UA 로 기기를 판별해 SSR 첫 컬럼수를 기기에 맞춤 → 첫 로드 점프 제거.
  //   클라의 폭 기반 반응형(899:1)은 그대로 유지 → 데스크탑 창 축소 시 1컬럼 전환 동작 불변.
  const ua = (await headers()).get("user-agent") ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);

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

  // 시술 리포트 컴팩트 카드 풀 — Feed 가 유기 카드 20장마다 1장 결정적 주입(점수 무관).
  //   앵커 draft 면 빈 배열 → 주입 안 함(공개 플립 전 동작 불변).
  const reportPool = await getReviewSummaryFeedPool(supabase);

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
          reportPool={reportPool}
          initialMobile={isMobileUA}
        />
      )}
    </section>
  );
}
