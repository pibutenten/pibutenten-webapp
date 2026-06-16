import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { getHotQaIds } from "@/lib/hot-ids";
import type { CardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import {
  asDoctorProfileData,
  type DoctorProfileData,
} from "@/lib/doctor-profile";
import DoctorProfileView from "./DoctorProfileView";
import {
  buildDoctorFull,
  buildDoctorScholarlyArticles,
} from "@/lib/schema/doctor";
import { clinicSchemaForDoctor } from "@/lib/schema/clinic";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { fetchCardList } from "@/lib/search-query";
import { CARD_LIST_SELECT } from "@/lib/card-select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Props = {
  params: Promise<{ slug: string }>;
};

/** 원장님 페이지 공유 시 OG 메타 — /public/og/{slug}.png 우선, 없으면 기본 og.png */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("name, title, clinic, intro")
    .eq("slug", slug)
    .maybeSingle()
    .returns<{ name: string; title: string; clinic: string; intro: string | null }>();
  if (!doctor) return {};
  // 주제(원장명·직함) first · 브랜드 last(템플릿이 "| 피부텐텐" 부가). 병원명 제외.
  const title = `${doctor.name} ${doctor.title}`;
  const description =
    doctor.intro?.trim() ||
    "직접 답한 전문의 Q&A·칼럼과 다루는 주요 시술을 한곳에서 볼 수 있습니다.";
  const canonical = `${SITE_URL}/doctors/${slug}`;
  // 2026-05-28: openGraph/twitter boilerplate 는 lib/og-meta.ts 헬퍼로 통합.
  return {
    title,
    description,
    alternates: { canonical },
    ...buildSocialMeta({
      title,
      description,
      canonical,
      ogImage: buildOgImage(slug),
      ogType: "profile",
      ogImageAlt: doctor.name,
    }),
  };
}

type Doctor = {
  id: string;
  slug: string;
  name: string;
  title: string;
  clinic: string;
  branch: string | null;
  intro: string | null;
  profile_data: unknown; // JSONB → DoctorProfileData
};

export default async function DoctorDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: doctor } = await supabase
    .from("doctors")
    .select("id, slug, name, title, clinic, branch, intro, profile_data")
    .eq("slug", slug)
    .maybeSingle()
    .returns<Doctor>();

  if (!doctor) notFound();
  const profile: DoctorProfileData = asDoctorProfileData(doctor.profile_data);

  // 카드 풀 로딩은 count → fetchCardList 의존 체인이므로 순차 유지(orderLimit 이 count 에 의존).
  //   이 체인을 하나의 비동기 함수로 묶어, count·체인과 무관한 viewer/hotIds/rawRelated 와 병렬 실행한다.
  //   notFound 게이트(doctor 부재 시 중단) 이후이므로 404 에서 헛수고하지 않는다.
  const loadCardPool = async () => {
    // 카운트는 별도 쿼리 — orderedIds(전체 순서) fetch 의 limit 산정에도 사용.
    const cRes = await supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("doctor_id", doctor.id);
    if (cRes.error) console.error("[doctor] 글 카운트 조회 실패:", cRes.error.message);
    const count = cRes.count ?? null;

    // 배치 ⑤ H3 (2026-05-28): fetchCardList SSOT 헬퍼로 통일.
    //   doctor 페이지는 q="" 이므로 항상 search_cards_scored RPC 경로 (홈 피드와 동일).
    // 홈 page.tsx 와 동일한 "순서(ID) 풀 + 초기 N장" 모델(무한스크롤):
    //   - orderedIds: 이 원장 전체 글을 같은 정렬(search_cards_scored q="" doctorSlug)로 한 번에 받아
    //     ID 배열만 추출 → 무한스크롤이 이 순서대로 /api/cards?ids= 로 다음 묶음을 이어 받는다.
    //   - cards(initialPool): 같은 풀의 앞 PAGE_SIZE 장만 전체 데이터로 초기 렌더(초기 SSR 가벼움).
    //   동일 정렬·동일 쿼리이므로 21번째 이후 경계가 끊기지 않는다(홈과 같은 불변식).
    // 상한 300(홈 피드 풀과 동일 규모) — 글 수백 편 원장에서도 SSR RPC 가 과부하되지 않게 클램프.
    const orderLimit = Math.min(Math.max(count ?? 0, PAGE_SIZE), 300);
    const { data: rawOrdered } = await fetchCardList(supabase, {
      q: "",
      doctorSlug: doctor.slug,
      boostDoctorSlug: null,
      offset: 0,
      limit: orderLimit,
    });
    const orderedCards = (rawOrdered ?? []) as CardData[];
    const orderedIds = orderedCards.map((c) => c.id);
    const cards = orderedCards.slice(0, PAGE_SIZE);
    return { count, orderedIds, cards };
  };

  // viewer prefetch — getUser 는 카드 풀과 무관(인증 세션 조회). hotIds·rawRelated 도 독립.
  const loadViewer = async () => {
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    return viewer ?? null;
  };

  // 사이드바 "함께 보면 좋은 Q&A" — 이 원장의 인기 Q&A 상위 5개(조회수 내림차순).
  //   PostDetail 의 related 는 "특정 글" 기준(같은 영상·키워드)이지만 원장 페이지엔 기준 글이 없으므로
  //   이 원장과 가장 관련 높은 인기 Q&A(=본인 인기 답변)로 채운다. published only(RLS 안전) + href 필드 포함.
  const loadRelatedQa = async () => {
    const { data: rawRelated, error: relatedErr } = await supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .eq("status", "published")
      .eq("doctor_id", doctor.id)
      .or("category.eq.qa,type.eq.qa")
      .is("deleted_at", null)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(5);
    if (relatedErr) console.error("[doctor] 인기 Q&A 조회 실패:", relatedErr.message);
    return (rawRelated ?? []) as unknown as CardData[];
  };

  // 카드 풀 체인 / viewer / hotIds / rawRelated 는 서로 독립 — 병렬 실행으로 워터폴 단축.
  const [{ count, orderedIds, cards }, viewer, hotIdsSet, relatedQa] =
    await Promise.all([
      loadCardPool(),
      loadViewer(),
      getHotQaIds(20),
      loadRelatedQa(),
    ]);

  // viewer 상태는 카드(cards) + viewer 둘 다 필요 → 위 병렬 결과가 모두 모인 뒤 실행.
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((q) => q.id),
  );

  const photo = getDoctorPhoto(doctor.slug);
  const theme = getDoctorTheme(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");
  const hotIds = Array.from(hotIdsSet);

  // 정책 (2026-05-17): /doctors/[slug] 는 viewer 와 무관하게 동일한 공개 프로필만 노출.
  //   본인(의사) dashboard 는 /{handle} 페이지가 담당 — IdentitySwitcher 가 본인 진입 시
  //   /{handle} 로 라우팅. /doctors/[slug] 에는 dashboard 분기 없음.

  // JSON-LD: Physician(풀세트, multi-typing) + BreadcrumbList — 헬퍼로 중앙화 (변경 1·2·4·6)
  const SITE = SITE_URL;
  const physicianLd = buildDoctorFull({
    slug: doctor.slug,
    name: doctor.name,
    title: doctor.title,
    intro: doctor.intro,
    profile_data: doctor.profile_data,
  });
  // 대표 논문(PMID) → ScholarlyArticle (화면 비노출, 봇 전용 저자-논문 그래프 — GEO A3).
  const scholarlyArticles = buildDoctorScholarlyArticles({
    slug: doctor.slug,
    name: doctor.name,
    title: doctor.title,
    intro: doctor.intro,
    profile_data: doctor.profile_data,
  });

  // 해당 의사의 단일 지점 MedicalClinic — physicianLd.worksFor 가 가리키는 entity 보장.
  // 5개 지점 전체 inject 안 함 (페이지 핵심 entity 신호 분산 회피).
  const singleClinic = clinicSchemaForDoctor(doctor.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      physicianLd,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "피부텐텐",
            item: `${SITE}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "전문의",
            item: `${SITE}/doctors`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${doctor.name} ${doctor.title}`,
          },
        ],
      },
      ...scholarlyArticles,
      ...(singleClinic ? [singleClinic] : []),
    ],
  };

  return (
    <>
      {/* JSON-LD(Physician 풀세트 + BreadcrumbList + ScholarlyArticle + MedicalClinic) —
          SEO 핵심. 셸 바깥(서버 출력)에 그대로 보존. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      {/* 본문(원장 hero · 프로필 · 답변 피드) 은 앱 셸로 승격. 데이터·메타·JSON-LD 는 서버가 보존. */}
      <DoctorProfileView
        slug={doctor.slug}
        name={doctor.name}
        intro={doctor.intro}
        affiliation={affiliation}
        photo={photo}
        theme={theme}
        profile={profile}
        cards={cards}
        orderedIds={orderedIds}
        relatedQa={relatedQa}
        count={count}
        hotIds={hotIds}
        viewerStates={viewerStates}
      />
    </>
  );
}
