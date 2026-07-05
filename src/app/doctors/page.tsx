import type { Metadata } from "next";
import { Fragment } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDoctorReference } from "@/lib/schema/doctor";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import DoctorsListView from "./DoctorsListView";

export const dynamic = "force-dynamic";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  title: string;
  clinic: string;
  branch: string | null;
  photo_url: string | null;
  intro: string | null;
  sort_order: number;
};

export const metadata: Metadata = {
  title: "피부과 전문의",
  description:
    "피부텐텐과 함께하는 피부과 전문의 프로필. 각 전문 분야와 답변·칼럼을 한눈에 살펴보세요.",
  alternates: { canonical: `${SITE_URL}/doctors` },
  robots: { index: true, follow: true },
  ...buildSocialMeta({
    title: "피부과 전문의",
    description:
      "피부텐텐과 함께하는 피부과 전문의들. 안티에이징·리프팅·스킨부스터 분야 검증된 답변.",
    canonical: `${SITE_URL}/doctors`,
    ogImage: buildOgImage(null),
    ogType: "website",
  }),
};

export default async function DoctorsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: doctors, error } = await supabase
    .from("doctors")
    .select(
      "id, slug, name, title, clinic, branch, photo_url, intro, sort_order",
    )
    // 미공개(is_listed=false) 원장은 목록에서 제외 (마이그 0341, 원장 공개 필터).
    .eq("is_listed", true)
    .order("sort_order", { ascending: true })
    .returns<Doctor[]>();

  if (error) {
    return (
      <section className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        원장님 정보를 불러오지 못했어요.
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
          {error.message}
        </pre>
      </section>
    );
  }

  if (!doctors || doctors.length === 0) {
    return (
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
        등록된 원장님이 없습니다.
      </section>
    );
  }

  // JSON-LD: CollectionPage + ItemList + BreadcrumbList
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/doctors#collection`,
        name: "피부과 전문의",
        description:
          "피부텐텐과 함께하는 피부과 전문의 프로필 모음. 각 전문의의 전문 분야와 답변을 한눈에.",
        url: `${SITE_URL}/doctors`,
        about: {
          "@type": "MedicalSpecialty",
          name: "Dermatology",
        },
        // 전역 layout 의 WebSite(#website) @id 참조 — 인라인 재정의 금지(그래프 결속, @id 충돌 0).
        isPartOf: { "@id": `${SITE_URL}/#website` },
        inLanguage: "ko-KR",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: doctors.length,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          itemListElement: doctors.map((d, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            item: buildDoctorReference({
              slug: d.slug,
              name: d.name,
              title: d.title,
            }),
          })),
        },
        // BreadcrumbList 는 @graph 독립 노드 → @id 참조(reports 라우트와 동일 패턴).
        breadcrumb: { "@id": `${SITE_URL}/doctors#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE_URL}/doctors#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "홈",
            item: `${SITE_URL}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "피부과 전문의",
            item: `${SITE_URL}/doctors`,
          },
        ],
      },
    ],
  };

  // 본문(의사 카드 그리드)만 앱 셸 클라이언트 뷰로 위임.
  //   JSON-LD <script> 는 셸 바깥 Fragment 에 유지(선례 DoctorProfileView 동일 — SEO 보존).
  return (
    <Fragment>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <DoctorsListView
        doctors={doctors.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          title: d.title,
          photo_url: d.photo_url,
          sort_order: d.sort_order,
        }))}
      />
    </Fragment>
  );
}
