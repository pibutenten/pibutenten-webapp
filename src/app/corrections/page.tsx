import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoShell from "@/components/info/InfoShell";

export const metadata: Metadata = {
  title: "정정 정책",
  description:
    "피부텐텐 답변의 정정 절차와 30일 정정 이력 공개 — 사실 오류·인용 오류·법령 변경·학회 가이드라인 변경 대응. Mayo Clinic 모델 적용.",
  alternates: { canonical: `${SITE_URL}/corrections` },
  openGraph: {
    title: "정정 정책 | 피부텐텐",
    description: "답변의 정정 절차와 정정 이력 공개 안내.",
    url: `${SITE_URL}/corrections`,
    type: "website",
  },
};

/**
 * 정정 정책 — Mayo Clinic 30일 정정 이력 공개 모델.
 * (Layer 11.2 Corrections Policy)
 *
 * 정정 이력 DB 가 별도로 없으므로 본 페이지는 정적 — 정정 발생 시 운영자가
 * 본문에 추가하거나 별도 정정 이력 컬렉션을 신설할 때 자동 출력으로 전환.
 */
export default function CorrectionsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}/corrections#aboutpage`,
    name: "정정 정책",
    url: `${SITE_URL}/corrections`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  };

  return (
    <InfoShell>
    <InfoPageLayout
      current="corrections"
      title="정정 정책"
      subtitle="답변의 오류·법령 위반 발견 시 정정 절차"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <Section title="1. 정정 원칙">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            사실관계의 오류·법령 위반·학회 가이드라인 변경 등이 확인되면
            즉시 답변을 수정합니다.
          </li>
          <li>
            수정 후 30일간 해당 답변 하단에 정정 이력을 공개합니다 (Mayo Clinic 모델).
          </li>
          <li>
            30일 이후 정정 이력은 본 페이지 하단 archive 로 이동하여 영구
            보존됩니다.
          </li>
        </ul>
      </Section>

      <Section title="2. 정정 사유 분류">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="py-2 pr-3 font-semibold text-[var(--text)]">분류</th>
                <th className="py-2 pr-3 font-semibold text-[var(--text)]">설명</th>
                <th className="py-2 font-semibold text-[var(--text)]">예시</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-3"><strong>A. 사실 오류</strong></td>
                <td className="py-2 pr-3">의학적 사실이 틀린 경우</td>
                <td className="py-2">시술 메커니즘 오류</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-3"><strong>B. 출처 오류</strong></td>
                <td className="py-2 pr-3">인용 PMID/DOI 부정확</td>
                <td className="py-2">잘못된 논문 인용</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-3"><strong>C. 법령 변경</strong></td>
                <td className="py-2 pr-3">의료법·약사법·식약처 고시 개정</td>
                <td className="py-2">의료광고 규정 변경</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-2 pr-3"><strong>D. 가이드라인 변경</strong></td>
                <td className="py-2 pr-3">학회 가이드라인 개정 반영</td>
                <td className="py-2">대한피부과학회 신규 권고안</td>
              </tr>
              <tr>
                <td className="py-2 pr-3"><strong>E. 표기 오류</strong></td>
                <td className="py-2 pr-3">오탈자·맞춤법 (30일 공개 대상 아님)</td>
                <td className="py-2">단순 오타</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="3. 정정 요청 채널">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            이메일:{" "}
            <a
              href="mailto:pibutenten@gmail.com?subject=%5B%EC%A0%95%EC%A0%95%20%EC%9A%94%EC%B2%AD%5D"
              className="text-[var(--primary)] hover:underline"
            >
              pibutenten@gmail.com
            </a>{" "}
            (제목: [정정 요청])
          </li>
          <li>
            콘텐츠 신고:{" "}
            <Link href="/report" className="text-[var(--primary)] hover:underline">
              /report
            </Link>
          </li>
          <li>접수 후 24~72시간 이내 검토 개시, 7영업일 이내 처리</li>
        </ul>
      </Section>

      <Section title="4. 정정 표시 형식">
        <p className="mb-3">정정된 답변 하단에 다음 형식으로 표기됩니다.</p>
        <blockquote className="border-l-4 border-[var(--primary)] bg-gray-50 p-4 text-[13.5px]">
          <strong>정정 (2026-XX-XX)</strong>: 본 답변의 §3 부분에서 "혈관 폐색은
          매우 드물게 발생한다"는 표현을 "혈관 폐색은 드물지만 즉각적 처치가
          필요한 응급 상황"으로 수정했습니다. 사유: 학회 가이드라인 변경 반영 (D).
        </blockquote>
      </Section>

      <Section title="5. 익명 처리">
        <p>
          정정 요청자가 비공개를 요청하면 정정 이력에 요청자 신원을 표시하지
          않습니다.
        </p>
      </Section>

      <Section title="최근 30일 정정 이력">
        <div className="rounded-md border border-[var(--border)] bg-gray-50 p-4 text-[13.5px] text-[var(--text-muted)]">
          현재 공개된 정정 이력이 없습니다.
        </div>
      </Section>

      <p className="text-[12px] text-[var(--text-muted)]">
        본 정책 시행일: 2026-05-28.
      </p>
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
