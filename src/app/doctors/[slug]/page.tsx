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

  // 배치 ⑤ H3 (2026-05-28): fetchCardList SSOT 헬퍼로 통일.
  //   doctor 페이지는 q="" 이므로 항상 search_cards_scored RPC 경로 (홈 피드와 동일).
  const { data: rawCards } = await fetchCardList(supabase, {
    q: "",
    doctorSlug: doctor.slug,
    boostDoctorSlug: null,
    offset: 0,
    limit: PAGE_SIZE,
  });
  const cards = (rawCards ?? []) as CardData[];
  // 카운트는 별도 쿼리
  const cRes = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("doctor_id", doctor.id);
  const count = cRes.count ?? null;

  // viewer prefetch
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    viewer?.id ?? null,
    cards.map((q) => q.id),
  );

  const photo = getDoctorPhoto(doctor.slug);
  const theme = getDoctorTheme(doctor.slug);
  const affiliation = [doctor.clinic, doctor.branch].filter(Boolean).join(" ");
  const hotIds = Array.from(await getHotQaIds(20));

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
      {/* 본문(원장 hero · 프로필 · 답변 피드) 은 베타 셸로 승격. 데이터·메타·JSON-LD 는 서버가 보존. */}
      <DoctorProfileView
        slug={doctor.slug}
        name={doctor.name}
        intro={doctor.intro}
        affiliation={affiliation}
        photo={photo}
        theme={theme}
        profile={profile}
        cards={cards}
        count={count}
        hotIds={hotIds}
        viewerStates={viewerStates}
      />
    </>
  );
}
