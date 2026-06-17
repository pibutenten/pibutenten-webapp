import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { jsonLdString } from "@/lib/json-ld";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoShell from "@/components/info/InfoShell";

export const metadata: Metadata = {
  title: "의학 검수 프로세스",
  description:
    "피부텐텐 답변이 어떻게 검수되는지 — 작성·의학 검수·팩트체크·법령 검수·게재·정기 재검토 6단계 흐름. Mayo Clinic 4-date 모델 적용.",
  alternates: { canonical: `${SITE_URL}/medical-review` },
  robots: { index: true, follow: true },
  ...buildSocialMeta({
    title: "의학 검수 프로세스",
    description:
      "이 답변은 어떻게 검수되나요? 6단계 검수 흐름과 4-date 모델 안내.",
    canonical: `${SITE_URL}/medical-review`,
    ogImage: buildOgImage(null),
    ogType: "website",
  }),
};

/**
 * 의학 검수 프로세스 — "이 답변은 어떻게 검수되나요?"
 * (Layer 11.2 Medical Review Process)
 */
export default function MedicalReviewPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}/medical-review#aboutpage`,
    name: "의학 검수 프로세스",
    url: `${SITE_URL}/medical-review`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  };

  return (
    <InfoShell>
    <InfoPageLayout
      current="medical-review"
      title="의학 검수 프로세스"
      subtitle="이 답변은 어떻게 검수되나요?"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <Section title="한눈에 보는 검수 흐름">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong className="text-[var(--text)]">작성</strong> — 피부과 전문의가
            직접 답변을 작성하거나, 본인의 유튜브·릴스 영상에서 다룬 내용을
            바탕으로 정리된 초안을 의사가 검수합니다.
          </li>
          <li>
            <strong className="text-[var(--text)]">의학 검수</strong> — 작성한
            의사와 다른 피부과 전문의가 의학적 정확성·최신 가이드라인 부합 여부를
            확인합니다.
          </li>
          <li>
            <strong className="text-[var(--text)]">팩트체크</strong> — 인용된
            학회 가이드라인·논문 출처가 실제 존재하고 의도와 일치하는지 확인합니다.
          </li>
          <li>
            <strong className="text-[var(--text)]">법령 검수</strong> —{" "}
            「의료법」 제56조 광고 금지 사항·약사법 위반 여부를 점검합니다.
          </li>
          <li>
            <strong className="text-[var(--text)]">게재</strong> — 위 단계를
            통과한 답변만 사이트에 발행됩니다.
          </li>
          <li>
            <strong className="text-[var(--text)]">정기 재검토</strong> — 시술·약물
            관련 답변은 최소 2년마다, 안정 주제는 매년 재검수합니다.
          </li>
        </ol>
      </Section>

      <Section title="답변에 표시되는 4개 날짜의 의미">
        <p className="mb-3">
          Mayo Clinic·Healthline 의 4-date 모델을 따릅니다.
        </p>
        <dl className="space-y-2">
          <div>
            <dt className="font-semibold text-[var(--text)]">최초 작성일</dt>
            <dd>답변이 처음 작성된 날짜.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">의학 검수일</dt>
            <dd>
              작성자가 아닌 다른 피부과 전문의가 의학적으로 검토한 날짜.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">팩트체크일</dt>
            <dd>인용된 출처·통계가 확인된 날짜.</dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">최종 업데이트일</dt>
            <dd>본문이 마지막으로 수정·보강된 날짜.</dd>
          </div>
        </dl>
      </Section>

      <Section title="왜 이렇게 검수하나요?">
        <p>
          피부 시술·치료 정보는 사람의 건강에 직접 영향을 주는 YMYL (Your Money or
          Your Life) 콘텐츠입니다. 잘못된 정보는 사용자가 적절치 않은 시술을
          받거나 부작용·합병증을 인지하지 못하게 만들 수 있습니다. 본 사이트는
          Mayo Clinic · Cleveland Clinic 등 글로벌 의료 사이트의 검수 표준을
          참고하여 6단계 검수 흐름을 운영합니다.
        </p>
      </Section>

      <Section title="회원 글은 의학 검수 대상이 아닙니다">
        <p>
          본 페이지의 검수 프로세스는 의사 답변에 적용됩니다. 일반 회원 글은
          개인 의견이며 의료 정보가 아니므로 의학 검수 대상이 아닙니다. 회원
          글은 검색엔진·AI 답변 엔진의 의료 정보로 인용되지 않도록 색인에서
          제외됩니다.
        </p>
      </Section>

      <Section title="답변 내용에 오류를 발견하셨다면">
        <p>
          이메일{" "}
          <a
            href="mailto:pibutenten@gmail.com?subject=%5B%EC%A0%95%EC%A0%95%20%EC%9A%94%EC%B2%AD%5D"
            className="text-[var(--primary)] hover:underline"
          >
            pibutenten@gmail.com
          </a>{" "}
          (제목: [정정 요청]) 또는{" "}
          <Link href="/report" className="text-[var(--primary)] hover:underline">
            콘텐츠 신고
          </Link>{" "}
          페이지로 알려 주세요. 정정 절차는{" "}
          <Link href="/corrections" className="text-[var(--primary)] hover:underline">
            정정 정책
          </Link>{" "}
          에서 확인하실 수 있습니다.
        </p>
      </Section>

      <Section title="관련 정책">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link href="/editorial-policy" className="text-[var(--primary)] hover:underline">
              편집 정책
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
        </ul>
      </Section>
    </InfoPageLayout>
    </InfoShell>
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
