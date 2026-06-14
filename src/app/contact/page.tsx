import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { allClinicsSchema } from "@/lib/schema/clinic";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoBetaShell from "@/components/info/InfoBetaShell";

export const metadata: Metadata = {
  title: "문의",
  description:
    "피부텐텐 (주식회사 진솔컴퍼니) 운영팀 문의 채널 — 이메일·운영 책임자·콘텐츠 신고·정정 요청·보안 취약점 신고 안내.",
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    title: "문의 | 피부텐텐",
    description:
      "피부텐텐 운영팀에 연락하실 수 있는 채널 안내.",
    url: `${SITE_URL}/contact`,
    type: "website",
  },
};

/**
 * 문의 — 회사 정보 + 문의 채널 매트릭스.
 * (Layer 11.1 Contact 페이지 풀세트)
 */
export default function ContactPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": `${SITE_URL}/contact#contactpage`,
        name: "문의",
        url: `${SITE_URL}/contact`,
        inLanguage: "ko-KR",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        mainEntity: { "@id": `${SITE_URL}/#organization` },
      },
      // 5개 힐하우스 지점 MedicalClinic + 그룹 — /contact 도 그룹 전체 채널 안내 페이지.
      // layout.tsx 는 그룹 schema 만 보유 → 5개 지점은 이 페이지에서 풀세트로 노출.
      ...allClinicsSchema(),
    ],
  };

  return (
    <InfoBetaShell>
    <InfoPageLayout
      current="contact"
      title="문의"
      subtitle="피부텐텐 운영팀에 연락하실 수 있는 채널"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <nav
        aria-label="신고·보안 채널 바로가기"
        className="mb-8 rounded-md border border-[var(--border)] bg-gray-50 p-4 text-[13px]"
      >
        <h2 className="mb-2 text-[14px] font-bold text-[var(--text)]">
          빠른 접근
        </h2>
        <ul className="grid list-disc grid-cols-1 gap-1 pl-5 sm:grid-cols-2">
          <li>
            <Link
              href="/report"
              className="text-[var(--primary)] hover:underline"
            >
              콘텐츠 신고
            </Link>{" "}
            — 게시물·댓글 신고 양식
          </li>
          <li>
            <a
              href="/.well-known/security.txt"
              className="text-[var(--primary)] hover:underline"
            >
              보안 취약점 제보
            </a>{" "}
            — RFC 9116 채널 (.well-known/security.txt)
          </li>
          <li>
            <Link
              href="/corrections"
              className="text-[var(--primary)] hover:underline"
            >
              정정 요청
            </Link>{" "}
            — 답변의 오류·법령 위반 신고 절차
          </li>
          <li>
            <Link
              href="/disclosures"
              className="text-[var(--primary)] hover:underline"
            >
              이해상충 공개
            </Link>{" "}
            — 운영주체 자본·광고 관계
          </li>
        </ul>
      </nav>

      <Section title="회사 정보">
        <ul className="list-disc space-y-1 pl-5">
          <li>회사명: 주식회사 진솔컴퍼니</li>
          <li>사업자등록번호: 261-86-01781</li>
          <li>대표 및 운영책임자: 배정민</li>
          <li>주소: 서울특별시 강남구 강남대로 518, 4층</li>
          <li>전화: 02-6953-0167</li>
          <li>
            이메일:{" "}
            <a
              href="mailto:pibutenten@gmail.com"
              className="text-[var(--primary)] hover:underline"
            >
              pibutenten@gmail.com
            </a>
          </li>
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

      <Section title="문의 채널">
        <p className="mb-3">
          본 사이트의 모든 문의·요청 채널은{" "}
          <a
            href="mailto:pibutenten@gmail.com"
            className="text-[var(--primary)] hover:underline"
          >
            pibutenten@gmail.com
          </a>{" "}
          으로 단일화되어 있습니다. 메일 제목 앞에 분류 태그를 적어 보내 주시면
          빠르게 처리해 드립니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>[일반 문의]</strong> — 서비스 이용·기능 문의
          </li>
          <li>
            <strong>[정정 요청]</strong> — 답변의 의학적 오류·인용 오류·법령 위반 표현 신고.
            절차는{" "}
            <Link href="/corrections" className="text-[var(--primary)] hover:underline">
              /corrections
            </Link>{" "}
            참조.
          </li>
          <li>
            <strong>[컴플라이언스]</strong> — 의료법 §56·§57·약사법 위반 의심 신고
          </li>
          <li>
            <strong>[보안 신고]</strong> — 보안 취약점 제보. 절차는{" "}
            <a
              href="/.well-known/security.txt"
              className="text-[var(--primary)] hover:underline"
            >
              /.well-known/security.txt
            </a>{" "}
            참조.
          </li>
          <li>
            <strong>[의사 등록]</strong> — 피부과 전문의 자격증·면허번호·소속 의료기관 정보 첨부.
            운영자가 직접 자격을 확인한 후 의사 권한을 부여합니다.
          </li>
          <li>
            <strong>[언론 협력]</strong> — 매체 인터뷰·기고·취재 요청
          </li>
        </ul>
        <p className="mt-4 text-[13px]">
          콘텐츠·게시물 신고는{" "}
          <Link href="/report" className="text-[var(--primary)] hover:underline">
            /report
          </Link>{" "}
          페이지의 양식을 이용해 주세요. 정보통신망법 §44조의2 절차에 따라
          24~72시간 이내 검토 개시합니다.
        </p>
      </Section>

      <Section title="개인정보 관련 문의">
        <p>
          개인정보 처리·열람·정정·삭제 요청은{" "}
          <Link href="/privacy" className="text-[var(--primary)] hover:underline">
            개인정보 처리방침
          </Link>{" "}
          에 명시된 절차에 따라 처리됩니다. 개인정보 보호책임자는 배정민이며,
          접수 후 10일 이내 회신드립니다.
        </p>
      </Section>

      <Section title="응급 의료 안내">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
          <p>
            본 사이트는 응급 의료 안내를 제공하지 않습니다.{" "}
            <strong>응급 상황 시 119</strong> 또는 가까운 응급의료기관을
            이용해 주시기 바랍니다. 정신건강 위기 시 자살예방상담전화 109 ·
            정신건강위기상담 1577-0199 · 청소년상담 1388.
          </p>
        </div>
      </Section>

      <Section title="자주 묻는 문의">
        <dl className="space-y-3">
          <div>
            <dt className="font-semibold text-[var(--text)]">
              Q. 의사로 등록하고 싶습니다.
            </dt>
            <dd className="mt-1">
              피부과 전문의 자격증·의사면허번호·소속 의료기관 정보를{" "}
              <a
                href="mailto:pibutenten@gmail.com?subject=%5B%EC%9D%98%EC%82%AC%20%EB%93%B1%EB%A1%9D%5D"
                className="text-[var(--primary)] hover:underline"
              >
                pibutenten@gmail.com
              </a>{" "}
              으로 보내 주세요. 운영자가 직접 자격을 확인한 후 의사 권한을
              부여합니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">
              Q. 회원 탈퇴는 어떻게 하나요?
            </dt>
            <dd className="mt-1">
              로그인 후 설정 메뉴에서 가능합니다. 자세한 절차는{" "}
              <Link href="/privacy" className="text-[var(--primary)] hover:underline">
                개인정보 처리방침
              </Link>{" "}
              참조.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">
              Q. 광고·협찬 제안을 받으시나요?
            </dt>
            <dd className="mt-1">
              본 서비스는 비-광고·비-결제로 운영됩니다.{" "}
              <Link href="/disclosures" className="text-[var(--primary)] hover:underline">
                이해상충 공개
              </Link>{" "}
              참조.
            </dd>
          </div>
        </dl>
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
      <div className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}
