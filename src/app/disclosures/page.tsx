import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoShell from "@/components/info/InfoShell";

export const metadata: Metadata = {
  title: "이해상충 공개",
  description:
    "피부텐텐 운영주체와 참여 전문의의 잠재적 이해상충 관계 공개. 운영사 자본 관계·광고 협찬 정책·참여 전문의 이해상충 고지 방식.",
  alternates: { canonical: `${SITE_URL}/disclosures` },
  openGraph: {
    title: "이해상충 공개 | 피부텐텐",
    description: "운영주체·참여 전문의 이해상충 공개 정책.",
    url: `${SITE_URL}/disclosures`,
    type: "website",
  },
};

/**
 * 이해상충 공개 (Conflicts of Interest)
 * (Layer 11.2 Disclosures)
 *
 * 정책 결정 (운영자 [확정정보] 옵션 3):
 *   - 의사별 개별 이해상충 표 작성하지 않음.
 *   - 특정 답변이 작성 전문의의 중대 이해상충과 관련되면 해당 답변에 개별 고지.
 *   - 서비스 차원 상업관계 (광고·협찬·송객) 없음 명시.
 */
export default function DisclosuresPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${SITE_URL}/disclosures#aboutpage`,
    name: "이해상충 공개",
    url: `${SITE_URL}/disclosures`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
  };

  return (
    <InfoShell>
    <InfoPageLayout
      current="disclosures"
      title="이해상충 공개"
      subtitle="운영주체·참여 전문의의 잠재적 이해상충 관계"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />

      <Section title="1. 운영주체 측 이해상충">
        <ul className="list-disc space-y-1 pl-5">
          <li>운영 주체: 주식회사 진솔컴퍼니 (사업자등록번호 261-86-01781)</li>
          <li>
            본 서비스는 광고·협찬을 받지 않으며, 특정 의료기관·의료법인과
            광고·송객·수수료 계약을 체결하지 않습니다.
          </li>
          <li>
            본 서비스는 의료기관이 아닌 정보 플랫폼이며, 운영 주체는 진료·처방
            행위를 하지 않습니다.
          </li>
        </ul>
      </Section>

      <Section title="2. 광고·협찬 정책">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            본 서비스는 <strong>비-광고·비-결제</strong> 형태로 운영됩니다.
          </li>
          <li>
            의료기관·의료인의 광고를 게재하지 않으며, 제약사·기기사로부터
            협찬을 받지 않습니다.
          </li>
          <li>향후 광고 시스템 도입 시 본 페이지에 사전 고지합니다.</li>
        </ul>
      </Section>

      <Section title="3. 참여 전문의 이해상충 고지 방식">
        <p>
          참여 전문의는 각자 외부 의료기관에 소속되어 있으며, 개별 외부
          자문관계를 일괄 공개하지 않습니다. 다만 특정 답변이 작성 전문의의
          중대한 이해상충 (예: 본인이 자문하는 회사 제품을 직접 다루는 경우)
          과 관련되면 해당 답변에 개별 고지합니다. 서비스 차원 상업관계 (광고·
          협찬·송객) 는 없습니다. 별도 문의는{" "}
          <Link href="/contact" className="text-[var(--primary)] hover:underline">
            /contact
          </Link>{" "}
          로 보내 주세요.
        </p>
      </Section>

      <Section title="4. 회원 게시물 측 이해상충">
        <p>
          일반 회원이 작성한 게시물은 회사의 검수 대상이 아니나, 회원이 특정
          시술·의료기관·의료인을 추천·비교하거나 광고성 게시물·송객 의도가
          있는 게시물을 작성하면 「의료법」 제56조 위반으로 처리되어 사전 통지
          없이 삭제될 수 있습니다 (이용약관 제5조·제9조).
        </p>
      </Section>

      <Section title="5. 의료법 §56② 충돌 회피">
        <p>
          본 페이지의 공개는 투명성 목적이며, 어떤 의사도 자문관계를 광고로
          사용하지 않습니다. 본 페이지가 의료광고로 해석되지 않도록 광고적
          표현 (인증·표창·우월성 진술) 을 일체 배제하고 사실 진술만 합니다.
        </p>
      </Section>

      <Section title="6. 갱신 주기">
        <ul className="list-disc space-y-1 pl-5">
          <li>운영 주체 정보: 변경 시 즉시</li>
          <li>
            참여 전문의 이해상충 고지: 관련 답변 발생 시 즉시 반영
          </li>
        </ul>
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
