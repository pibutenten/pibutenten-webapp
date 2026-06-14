import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDoctorReference } from "@/lib/schema/doctor";
import { allClinicsSchema } from "@/lib/schema/clinic";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoBetaShell from "@/components/info/InfoBetaShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "사이트 안내",
  description:
    "피부텐텐은 피부과 전문의가 함께하는 피부 미용 커뮤니티입니다. 운영 주체 주식회사 진솔컴퍼니, 콘텐츠 정책, 의료 정보 면책 안내.",
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: "사이트 안내 | 피부텐텐",
    description:
      "피부과 전문의가 만드는 검증된 피부 미용 커뮤니티. 운영 주체·콘텐츠 정책·의료 면책 안내.",
    url: `${SITE_URL}/about`,
    type: "website",
  },
};

type DoctorRef = { slug: string; name: string; title: string };

/**
 * 사이트 안내 — 운영 주체, 콘텐츠 정책, 의료 면책.
 * (의료법 제56조 의료광고 제한 + YMYL E-E-A-T 신뢰 신호)
 *
 * v5.1 spec: AboutPage + MedicalOrganization 풀세트 schema.
 * 의사 카드 그리드는 /doctors에 있으므로 본문 노출 X.
 * schema의 member 배열에만 참여 전문의 @id 참조 (LLM·AEO 신호).
 */
export default async function AboutPage() {
  // 참여 전문의 — schema member 배열용으로만 fetch
  const supabase = await createSupabaseServerClient();
  const { data: doctors } = await supabase
    .from("doctors")
    .select("slug, name, title")
    .order("sort_order", { ascending: true })
    .returns<DoctorRef[]>();

  const memberRefs = (doctors ?? []).map((d) =>
    buildDoctorReference({ slug: d.slug, name: d.name, title: d.title }),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${SITE_URL}/about#about`,
        name: "사이트 안내",
        url: `${SITE_URL}/about`,
        inLanguage: "ko-KR",
        isPartOf: {
          "@type": "WebSite",
          name: "피부텐텐",
          url: SITE_URL,
        },
        mainEntity: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "MedicalOrganization",
        "@id": `${SITE_URL}/#organization`,
        name: "피부텐텐",
        alternateName: ["Pibutenten", "피부 텐텐"],
        url: SITE_URL,
        logo: `${SITE_URL}/brand-logo.svg`,
        image: `${SITE_URL}/og.png`,
        description:
          "피부과 전문의가 함께 만드는 피부 미용 커뮤니티. 시술·홈케어·안티에이징 관련 검증된 답변과 칼럼을 제공합니다.",
        // Mayo/Cleveland Clinic 벤치마크 — 책임 문서 schema 연결 (2026-05-28)
        publishingPrinciples: `${SITE_URL}/editorial-policy`,
        ethicsPolicy: `${SITE_URL}/editorial-policy`,
        correctionsPolicy: `${SITE_URL}/corrections`,
        ownershipFundingInfo: `${SITE_URL}/disclosures`,
        medicalSpecialty: ["Dermatology"],
        knowsAbout: [
          "피부과",
          "안티에이징",
          "리프팅",
          "스킨부스터",
          "피부 시술",
          "콜라겐",
          "보톡스",
          "필러",
          "써마지",
          "울쎄라",
          "쥬베룩",
          "여드름",
          "기미",
          "색소침착",
          "피부장벽",
        ],
        publisher: {
          "@type": "Organization",
          name: "주식회사 진솔컴퍼니",
          url: SITE_URL,
        },
        parentOrganization: {
          "@type": "Organization",
          name: "주식회사 진솔컴퍼니",
          taxID: "261-86-01781",
          address: {
            "@type": "PostalAddress",
            streetAddress: "강남대로 518, 4층",
            addressLocality: "강남구",
            addressRegion: "서울특별시",
            addressCountry: "KR",
          },
          telephone: "+82-2-6953-0167",
        },
        contactPoint: {
          "@type": "ContactPoint",
          email: "pibutenten@gmail.com",
          telephone: "+82-2-6953-0167",
          contactType: "customer support",
          availableLanguage: ["Korean", "ko-KR"],
        },
        sameAs: ["https://www.youtube.com/@pibutenten"],
        // 참여 전문의 — Person @id 참조 (풀 정보는 /doctors/{slug}#person 에 존재)
        ...(memberRefs.length > 0 ? { member: memberRefs } : {}),
        // 진료 가능 콘텐츠 분야 (AI 인용 신호 강화)
        availableService: [
          {
            "@type": "MedicalProcedure",
            name: "안티에이징",
            procedureType: "https://schema.org/PercutaneousProcedure",
          },
          {
            "@type": "MedicalProcedure",
            name: "리프팅",
            procedureType: "https://schema.org/PercutaneousProcedure",
          },
          {
            "@type": "MedicalProcedure",
            name: "스킨부스터",
            procedureType: "https://schema.org/PercutaneousProcedure",
          },
        ],
      },
      {
        "@type": "BreadcrumbList",
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
            name: "사이트 안내",
            item: `${SITE_URL}/about`,
          },
        ],
      },
      // 5개 힐하우스 지점 MedicalClinic + 그룹 — /about 은 그룹 전체를 소개하는 페이지.
      // layout.tsx 는 그룹 schema 만 보유 → 5개 지점은 이 페이지에서 풀세트로 노출.
      ...allClinicsSchema(),
    ],
  };

  return (
    <InfoBetaShell>
    <InfoPageLayout
      current="about"
      title="사이트 안내"
      subtitle="피부과 전문의가 함께 만드는 피부 미용 커뮤니티"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <p className="mb-8 text-[15px] leading-[1.7] text-[var(--text-secondary)]">
        피부텐텐은{" "}
        <Link
          href="/doctors"
          className="font-semibold text-[var(--primary)] hover:underline"
        >
          피부과 전문의
        </Link>
        가 함께 만드는 피부 미용 커뮤니티입니다. 사용자가 자유롭게 피부 고민을
        나누고, 전문의가 검수한 답변과 칼럼을 제공합니다.
      </p>

      <Section title="미션">
        <p>
          피부 시술에 대한 궁금증, 검증된 피부과 전문의가 답해드립니다.
        </p>
      </Section>

      <Section title="운영 주체">
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>회사명: 주식회사 진솔컴퍼니</li>
          <li>사업자등록번호: 261-86-01781</li>
          <li>대표 및 운영책임자: 배정민</li>
          <li>주소: 서울특별시 강남구 강남대로 518, 4층</li>
          <li>전화: 02-6953-0167</li>
          <li>
            문의:{" "}
            <a
              href="mailto:pibutenten@gmail.com"
              className="text-[var(--primary)] hover:underline"
            >
              pibutenten@gmail.com
            </a>
          </li>
        </ul>
      </Section>

      <Section title="의료기관 소속 관계">
        <p className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          본 서비스는 의료기관이 아닌 정보 플랫폼입니다. 참여 전문의는
          각자 외부 의료기관에 소속되어 있으며, 본 서비스 자체는 진료·처방·치료를
          제공하지 않습니다.
        </p>
      </Section>

      <Section title="콘텐츠 정책">
        <ul className="list-disc space-y-2 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>
            <strong className="font-semibold text-[var(--text)]">
              의료진 등록
            </strong>{" "}
            — 의료인(피부과 전문의) 계정은 운영자가 직접 면허번호·소속·동의를
            확인한 후 부여합니다. 일반 회원은 어떠한 방법(가입 옵션·자기 신고·
            소셜 로그인 등)으로도 의사 권한을 획득할 수 없으며,「의료법」
            제27조의 의료인 자격 사칭 위험을 구조적으로 차단하고 있습니다.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              전문의 답변
            </strong>{" "}
            — 피부과 전문의가 직접 작성·검수한 콘텐츠입니다. 의사
            회원의 답변·칼럼 작성은{" "}
            <Link
              href="/doctor-guidelines"
              className="text-[var(--primary)] hover:underline"
            >
              의사 답변 가이드라인
            </Link>
            에 따라 운영됩니다.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              회원 글
            </strong>{" "}
            — 일반 회원이 자유롭게 작성한 개인 의견입니다. 의료 정보가 아니며,
            검색엔진·AI에 의료 정보로 색인되지 않도록 처리합니다.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              카드 구분
            </strong>{" "}
            — 의사 글과 회원 글은 카드 디자인과 뱃지로 명확히 구분 표시됩니다.
          </li>
        </ul>
      </Section>

      <Section title="전문 분야">
        <p className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          안티에이징·리프팅·스킨부스터를 중심으로, 피부과 전문의의 검증된
          시술·홈케어·안티에이징 정보를 제공합니다. 시술별 원리·효과·부작용·관리법
          등을 한 곳에서 모아볼 수 있습니다.
        </p>
      </Section>

      <Section title="의료 정보 면책">
        <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-4 text-[13.5px] leading-[1.7] text-amber-900">
          <p className="mb-2 font-semibold">전문의 답변에 대한 안내</p>
          <p className="mb-2">
            본 사이트의 전문의 답변은 피부과 전문의가 작성한{" "}
            <strong>일반적인 의학 정보</strong>이며, 개인의 진단·치료를 대체하지
            않습니다. 시술 결정 전 반드시 의료진과 직접 상담하시기 바랍니다.
          </p>
          <p className="mb-3">
            본 서비스는 개별 회원에 대한 진단·처방·치료를 위한 의료상담을
            제공하지 않습니다. 전문의 답변은 같은 질문을 가진 모든 독자에게 도움이
            되도록 일반 의학 정보 형태로 제공되며, 특정 회원의 증상을 진단하거나
            치료방법을 결정하기 위한 것이 아닙니다.
          </p>
          <p className="mb-2 font-semibold">회원 글에 대한 안내</p>
          <p className="mb-2">
            회원이 작성한 글은 개인 의견이며 의료 정보가 아닙니다. 의료 결정
            시에는 반드시 전문의와 상담하시기 바랍니다.
          </p>
          <p className="mb-3">
            회원이 자신의 시술·치료 경험을 게시하거나 특정 의료기관·의료인을
            추천·비교하는 행위는 「의료법」 제56조 및 같은 법 시행령 제23조에
            따른 금지 광고에 해당할 수 있습니다. 회사는 이러한 게시물에 대해
            사전 통지 없이 삭제·블라인드 조치할 수 있습니다.
          </p>
          <p className="mb-2 font-semibold">응급 상황 안내</p>
          <p>
            호흡곤란, 의식 저하, 광범위한 발진·부종을 동반한 알레르기 반응 등
            응급 증상이 있는 경우 즉시 119에 신고하거나 가까운 응급의료기관을
            방문하시기 바랍니다. 본 서비스는 응급 의료 안내 채널이 아닙니다.
          </p>
        </div>
      </Section>

      <Section title="관련 문서">
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>
            <Link
              href="/editorial-policy"
              className="text-[var(--primary)] hover:underline"
            >
              편집 정책
            </Link>
          </li>
          <li>
            <Link
              href="/medical-review"
              className="text-[var(--primary)] hover:underline"
            >
              의학 검수 프로세스
            </Link>
          </li>
          <li>
            <Link
              href="/corrections"
              className="text-[var(--primary)] hover:underline"
            >
              정정 정책
            </Link>
          </li>
          <li>
            <Link
              href="/disclosures"
              className="text-[var(--primary)] hover:underline"
            >
              이해상충 공개
            </Link>
          </li>
          <li>
            <Link
              href="/doctor-guidelines"
              className="text-[var(--primary)] hover:underline"
            >
              의사 답변 가이드라인
            </Link>
          </li>
          <li>
            <Link
              href="/disclaimer"
              className="text-[var(--primary)] hover:underline"
            >
              의료 정보 안내
            </Link>
          </li>
          <li>
            <Link
              href="/terms"
              className="text-[var(--primary)] hover:underline"
            >
              이용약관
            </Link>
          </li>
          <li>
            <Link
              href="/privacy"
              className="text-[var(--primary)] hover:underline"
            >
              개인정보 처리방침
            </Link>
          </li>
          <li>
            <Link
              href="/contact"
              className="text-[var(--primary)] hover:underline"
            >
              문의
            </Link>
          </li>
        </ul>
      </Section>

      <Section title="외부 링크">
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>
            YouTube:{" "}
            <a
              href="https://www.youtube.com/@pibutenten"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              @pibutenten
            </a>
          </li>
        </ul>
      </Section>

    </InfoPageLayout>
    </InfoBetaShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[18px] font-bold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}
