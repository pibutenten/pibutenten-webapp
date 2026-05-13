import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "의사 답변 가이드라인",
  description:
    "피부텐텐 의사 회원이 답변·칼럼을 작성할 때 따라야 할 원칙. 의료법 제56조 및 의료 전문직 윤리에 부합하는 일반 의학 정보 작성 가이드.",
  alternates: { canonical: `${SITE_URL}/doctor-guidelines` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "의사 답변 가이드라인 | 피부텐텐",
    description:
      "피부과 전문의가 본 서비스에서 답변·칼럼을 작성할 때 따라야 할 원칙. 일반 의학 정보 제공의 성격, 권장·금지 답변, 의료법 광고 금지 사항.",
    url: `${SITE_URL}/doctor-guidelines`,
    type: "article",
  },
};

/**
 * 의사 답변 가이드라인.
 * 시행일: 2026-05-13 (pbtt.kr 런칭과 동시)
 * 「의료법」 제56조 및 같은 법 시행령 제23조에 부합하도록 작성.
 */
export default function DoctorGuidelinesPage() {
  return (
    <article className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
      <header className="mb-8">
        <h1 className="mb-3 text-[26px] font-bold leading-[1.35] text-[var(--text)] sm:text-[30px]">
          의사 답변 가이드라인
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          시행일자: 2026년 5월 13일
        </p>
      </header>

      <p className="mb-4 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
        피부텐텐은 피부과 전문의가 함께 만드는 Q&amp;A SNS입니다. 의사 회원의
        답변은 회원과 일반 독자가 피부 건강에 대해 정확한 정보를 얻고 의료적
        의사결정을 내리는 데 도움을 주는 <strong>일반 의학 정보</strong>로
        제공됩니다.
      </p>
      <p className="mb-8 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
        본 가이드라인은 의사 회원이 본 서비스에서 답변·칼럼을 작성할 때 따라야
        할 원칙을 명시하며, 「의료법」, 「약사법」 등 관련 법령과 의료 전문직
        윤리에 부합하도록 작성되었습니다.
      </p>

      <Section title="1. 답변의 성격">
        <p className="mb-2">
          본 서비스에서의 답변은 <strong>일반 의학 정보 제공</strong>입니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>답변은 특정 질문자에 대한 개별 진료가 아닙니다.</li>
          <li>
            답변은 직접 진찰을 대체할 수 없으며, 진단서·처방전·소견서를 발급하는
            행위가 아닙니다.
          </li>
          <li>
            답변은 질문자뿐 아니라 같은 글을 읽는 모든 독자에게 도움이 될 수
            있도록 일반적인 의학 정보로 작성합니다.
          </li>
        </ul>
      </Section>

      <Section title="2. 권장하는 답변">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            질환·증상·시술의 일반적인 원리, 일반적인 치료 방향, 일반적으로
            알려진 부작용에 대한 설명
          </li>
          <li>의학적으로 확인된 정보와 그렇지 않은 정보의 구분</li>
          <li>자가관리·생활 습관·예방에 도움이 되는 정보</li>
          <li>어떤 경우에 의료기관을 방문해야 하는지에 대한 안내</li>
        </ul>
      </Section>

      <Section title="3. 피해야 할 답변">
        <p className="mb-2">
          다음에 해당하는 답변은 「의료법」 등 관련 법령 위반 또는 의료 윤리에
          어긋날 수 있어 피해야 합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            질문자에게 특정 진단명을 단정적으로 부여하는 답변
            (&ldquo;○○병입니다&rdquo;, &ldquo;확실히 ○○입니다&rdquo; 등)
          </li>
          <li>특정 약물·시술·치료를 구체적으로 처방하거나 권유하는 답변</li>
          <li>
            특정 의료기관·의료인을 추천·홍보하는 답변 (본인 소속 병원 포함)
          </li>
          <li>다른 의료기관·의료인을 비교하거나 평가절하하는 답변</li>
          <li>부작용·합병증을 누락하고 효능만 강조하는 답변</li>
          <li>
            객관적으로 확인되지 않은 치료법·시술·약물에 대해 효과를 단정하는
            답변
          </li>
        </ul>
      </Section>

      <Section title="4. 의료법 광고 금지 사항 유의">
        <p className="mb-2">
          「의료법」 제56조 및 같은 법 시행령 제23조는 다음과 같은 의료광고를
          금지하고 있습니다. 의사 회원은 본 서비스에서의 답변·칼럼 작성 시 아래
          사항에 해당하지 않도록 주의해 주시기 바랍니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>환자의 치료경험담을 활용한 광고</li>
          <li>거짓 또는 과장된 내용의 광고</li>
          <li>비교 광고 (다른 의료기관·의료인과의 비교)</li>
          <li>객관적으로 인정되지 않은 내용을 임상적 효과로 표현한 광고</li>
          <li>부작용 등 중요 정보를 누락한 광고</li>
          <li>
            신문·잡지·방송이나 이와 유사한 매체를 통해 기사·전문가 의견 형태로
            표현된 광고
          </li>
        </ul>
      </Section>

      <Section title="5. 추천 답변 구조">
        <p className="mb-2">
          답변을 작성할 때 다음 구조를 따르면 일반 의학 정보로서의 성격이
          명확해지고 의료법 위반 소지가 줄어듭니다.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>질문 요지 정리</strong> — 어떤 점이 궁금한 상황인지 일반화
            하여 정리
          </li>
          <li>
            <strong>일반적인 의학 정보 설명</strong> — 해당 증상·시술·질환에
            대한 일반적인 정보 (가능한 경우 참고 출처 명시)
          </li>
          <li>
            <strong>일반적인 주의사항·부작용 안내</strong> — 모든 의학적 정보는
            부작용·합병증·금기와 함께 제시
          </li>
          <li>
            <strong>의료기관 방문 권유</strong> — 개인의 상태에 대한 정확한
            진단·치료를 위해서는 의료기관에서 직접 진료를 받아야 함을 명시
          </li>
        </ol>
      </Section>

      <Section title="6. 응급 상황 안내">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p>
            호흡곤란, 의식 저하, 광범위한 발진·부종을 동반한 알레르기 반응 등
            응급 증상이 의심되는 질문의 경우 즉시 119 또는 가까운 응급의료기관
            방문을 안내해 주시기 바랍니다. 본 서비스는 응급 의료 안내를 위한
            채널이 아닙니다.
          </p>
        </div>
      </Section>

      <Section title="7. 가이드라인 위반 시 조치">
        <p>
          회사는 본 가이드라인을 위반하거나 「의료법」 등 관련 법령에 위반될
          우려가 있는 답변에 대해 사전 통지 없이 삭제·수정·블라인드 처리할 수
          있으며, 위반이 반복되거나 중대한 경우 의사 회원 자격을 정지 또는
          상실시킬 수 있습니다.
        </p>
      </Section>

      <Section title="8. 가이드라인 개정">
        <p>
          본 가이드라인은 법령 개정·서비스 운영 경험·의료계 자문 등을 반영하여
          주기적으로 개정될 수 있으며, 개정 시 본 페이지를 통해 공지합니다.
        </p>
      </Section>

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-[13px] text-[var(--text-muted)]">
        <p className="mb-1">
          문의:{" "}
          <a
            href="mailto:pibutenten@gmail.com"
            className="text-[var(--primary)] hover:underline"
          >
            pibutenten@gmail.com
          </a>
        </p>
        <p>주식회사 진솔컴퍼니</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-md bg-[var(--text-secondary)] px-4 py-2 font-semibold text-white hover:bg-[var(--text)]"
            style={{ color: "#FFFFFF" }}
          >
            홈으로
          </Link>
          <Link
            href="/terms"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            개인정보 처리방침
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            사이트 안내
          </Link>
        </div>
      </footer>
    </article>
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
    <section className="mb-8 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
      <h2 className="mb-3 text-[17px] font-bold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}
