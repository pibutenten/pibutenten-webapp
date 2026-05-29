import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import InfoPageLayout from "@/components/info/InfoPageLayout";

export const metadata: Metadata = {
  title: "편집 정책",
  description:
    "피부텐텐의 콘텐츠 작성·검수·팩트체크·법령검수·게재·재검토 5단계 워크플로우, 출처 우선순위, AI 사용 정책 (Mayo Clinic·Cleveland Clinic 벤치마크).",
  alternates: { canonical: `${SITE_URL}/editorial-policy` },
  openGraph: {
    title: "편집 정책 | 피부텐텐",
    description:
      "콘텐츠 작성·검수 5단계 워크플로우, 출처 우선순위, AI 사용 정책.",
    url: `${SITE_URL}/editorial-policy`,
    type: "website",
  },
};

/**
 * 편집 정책 — Mayo/Cleveland Clinic/Healthline/WebMD 4대 벤치마크 패턴.
 * (Layer 11.2 Editorial Policy)
 */
export default function EditorialPolicyPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}/editorial-policy#aboutpage`,
    name: "편집 정책",
    url: `${SITE_URL}/editorial-policy`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  };

  return (
    <InfoPageLayout
      current="editorial-policy"
      title="편집 정책"
      subtitle="피부텐텐 콘텐츠가 어떤 절차로 작성·검수되는지 안내"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <p className="mb-6">
        본 문서는 Mayo Clinic · Cleveland Clinic · Healthline · WebMD 4대 글로벌
        의료 사이트의 편집 표준을 참고하여 피부텐텐 콘텐츠가 어떻게 작성·검수되는지
        설명합니다.
      </p>

      <nav
        aria-label="콘텐츠 정책 허브 바로가기"
        className="mb-8 rounded-md border border-[var(--border)] bg-gray-50 p-4 text-[13px]"
      >
        <h2 className="mb-2 text-[14px] font-bold text-[var(--text)]">
          관련 정책 바로가기
        </h2>
        <ul className="grid list-disc grid-cols-1 gap-1 pl-5 sm:grid-cols-2">
          <li>
            <Link
              href="/medical-review"
              className="text-[var(--primary)] hover:underline"
            >
              의학 검수 프로세스
            </Link>{" "}
            — 답변이 어떻게 검수되는지 (4-date 모델)
          </li>
          <li>
            <Link
              href="/corrections"
              className="text-[var(--primary)] hover:underline"
            >
              정정 정책
            </Link>{" "}
            — 오류·법령 변경 시 정정 절차
          </li>
          <li>
            <Link
              href="/disclosures"
              className="text-[var(--primary)] hover:underline"
            >
              이해상충 공개
            </Link>{" "}
            — 운영주체·참여 전문의 이해상충
          </li>
          <li>
            <Link
              href="/doctor-guidelines"
              className="text-[var(--primary)] hover:underline"
            >
              의사 답변 가이드라인
            </Link>{" "}
            — 의사 회원 작성 기준
          </li>
        </ul>
      </nav>

      <Section title="1. 콘텐츠 작성·검수 워크플로우">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>작성</strong> — 보건복지부 인증 피부과 전문의가 본인의 명함으로
            답변·칼럼 작성
          </li>
          <li>
            <strong>의학 검수</strong> — 작성자와 다른 피부과 전문의가 의학적
            정확성·근거 검증
          </li>
          <li>
            <strong>팩트체크</strong> — 인용된 PubMed PMID·DOI·학회 가이드라인이
            원본과 일치하는지 검증
          </li>
          <li>
            <strong>법령 검수</strong> — 의료법 §56② 14금지광고 + §57 사전심의
            필요성 자동·수동 검토
          </li>
          <li>
            <strong>게재</strong> — 위 4단계 통과 후 발행
          </li>
          <li>
            <strong>정기 재검토</strong> — 시술·약물 주제 2년마다 / 안정 주제
            매년 재검수
          </li>
        </ol>
      </Section>

      <Section title="2. 출처 우선순위">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Cochrane Systematic Reviews</li>
          <li>PubMed indexed 메타분석</li>
          <li>학회 가이드라인 (대한피부과학회·미국피부과학회 AAD·유럽피부성병학회 EADV)</li>
          <li>PubMed indexed 1차 논문</li>
          <li>의학 교과서</li>
          <li>임상 전문가 합의</li>
        </ol>
        <p className="mt-3">
          최근 5년 이내 출처를 본문 인용의 70% 이상으로 유지합니다. 인용 표기는
          Vancouver 스타일 (저자 · 제목 · 학술지 · 연도 · PMID/DOI) 을 권장합니다.
        </p>
      </Section>

      <Section title="3. AI 사용 정책">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            피부과 전문의가 본인의 유튜브·릴스 등 영상 콘텐츠에서 직접 다룬
            내용을 바탕으로 작성한 글을, 생성형 AI (Anthropic Claude 등) 로
            가독성·구성을 다듬습니다.
          </li>
          <li>
            AI 는 정리·교정 보조에 한정되며, 의학적 판단·사실관계는 작성
            전문의에게 있습니다.
          </li>
          <li>
            모든 답변은 게재 전 반드시 피부과 전문의의 검수·수정·승인을 거칩니다.
          </li>
          <li>회원 글에는 AI 가 개입하지 않습니다.</li>
        </ul>
      </Section>

      <Section title="4. 의학 검수 주기 (Mayo Clinic 4-date 모델)">
        <p className="mb-3">
          모든 의사 답변 페이지는 다음 4개 날짜를 표기합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>최초 작성일 (Written on)</li>
          <li>의학 검수일 (Medical reviewed on)</li>
          <li>팩트체크일 (Fact-checked on)</li>
          <li>최종 업데이트일 (Updated on)</li>
        </ul>
        <p className="mt-3">
          빠르게 변하는 주제 (시술·약물): 최소 2년마다 재검수.
          <br />
          안정 주제 (피부장벽·기본 스킨케어): 매년 재검수.
        </p>
      </Section>

      <Section title="5. 다양성·공정성">
        <p>
          참여 전문의의 답변·작성자 표시 순서는 ranking 없이 무작위 또는
          시간순으로 표시합니다 (의료법 §56② 4호 비교광고 회피).
        </p>
      </Section>

      <Section title="6. 광고·협찬 정책">
        <p>
          본 사이트의 모든 의사 답변은 비-광고·비-유료 의학 정보로 운영됩니다.
          협찬 받은 의료 후기는 의료법 §56② 2호 위반 위험이 있어 게재하지 않으며,
          외부 광고도 게재하지 않습니다. 자세한 이해상충 정책은{" "}
          <Link href="/disclosures" className="text-[var(--primary)] hover:underline">
            이해상충 공개
          </Link>{" "}
          참조.
        </p>
      </Section>

      <Section title="7. 분쟁·정정 처리">
        <p>
          오류·법령 위반 발견 시 즉시 정정하며,{" "}
          <Link href="/corrections" className="text-[var(--primary)] hover:underline">
            정정 정책
          </Link>{" "}
          에 따라 30일간 정정 이력을 공개합니다.
        </p>
      </Section>

      <Section title="8. 관련 정책">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link href="/medical-review" className="text-[var(--primary)] hover:underline">
              의학 검수 프로세스
            </Link>
          </li>
          <li>
            <Link href="/corrections" className="text-[var(--primary)] hover:underline">
              정정 정책
            </Link>
          </li>
          <li>
            <Link href="/disclosures" className="text-[var(--primary)] hover:underline">
              이해상충 공개
            </Link>
          </li>
          <li>
            <Link href="/disclaimer" className="text-[var(--primary)] hover:underline">
              의료 정보 면책
            </Link>
          </li>
          <li>
            <Link href="/doctor-guidelines" className="text-[var(--primary)] hover:underline">
              의사 답변 가이드라인
            </Link>
          </li>
        </ul>
      </Section>

      <p className="text-[12px] text-[var(--text-muted)]">
        본 정책 시행일: 2026-05-28. 본 정책은 매년 1회 운영팀이 자체 리뷰하며
        필요한 경우 개정합니다.
      </p>
    </InfoPageLayout>
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
