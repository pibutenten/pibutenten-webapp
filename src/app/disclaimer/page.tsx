import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import InfoPageLayout from "@/components/info/InfoPageLayout";

export const metadata: Metadata = {
  title: "의료 정보 안내 — 피부텐텐",
  description:
    "피부텐텐의 모든 콘텐츠는 일반적인 의학 정보 제공 목적이며, 개인의 진단·치료를 대체하지 않습니다.",
  alternates: { canonical: `${SITE_URL}/disclaimer` },
  openGraph: {
    title: "의료 정보 안내 — 피부텐텐",
    description:
      "피부텐텐의 콘텐츠 성격, 응급 시 대응, 사용자 책임에 관한 안내.",
    url: `${SITE_URL}/disclaimer`,
    type: "website",
  },
};

export default function DisclaimerPage() {
  return (
    <InfoPageLayout
      current="disclaimer"
      title="의료 정보 안내"
      subtitle="피부텐텐 콘텐츠의 성격·한계·응급 대응 안내"
    >
      <p className="mb-8 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        본 페이지는 피부텐텐 콘텐츠의 성격과 한계, 응급 상황 대응에 대해
        안내합니다. 본 안내는{" "}
        <Link
          href="/terms"
          className="text-[var(--primary)] hover:underline"
        >
          이용약관 제12조
        </Link>
        와 함께 적용됩니다.
      </p>

      <Section title="콘텐츠 성격">
        <p className="mb-3">
          피부텐텐에서 제공하는 모든 콘텐츠 — 피부과 전문의 답변, 칼럼, 회원
          게시물·댓글, AI 보조로 작성된 글 초안 — 은 <strong>일반적인 의학
          정보</strong>입니다.
        </p>
        <p className="mb-3">
          개별 환자의 증상에 대한 <strong>진단·처방·치료를 대체하지
          않습니다</strong>. 콘텐츠는 의사가 검수·작성하더라도, 글을 읽는 회원
          본인의 실제 상태를 진찰하지 않은 상태에서 작성되었습니다.
        </p>
        <p>
          시술·치료·약물 사용을 결정하실 때는 반드시 의료기관을 방문하여 자격
          있는 의료진과 직접 상담하시기 바랍니다.
        </p>
      </Section>

      <Section title="응급 증상 시 대응">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="mb-2 font-semibold">
            다음 증상은 응급의료기관을 즉시 방문해야 합니다.
          </p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-[14px]">
            <li>호흡곤란, 의식 저하</li>
            <li>광범위한 발진·부종을 동반한 알레르기 반응 (아나필락시스 의심)</li>
            <li>광범위한 화상·열상·심한 출혈</li>
            <li>안면 마비, 발음 장애, 한쪽 신체 마비 (뇌졸중 의심)</li>
          </ul>
          <p className="mb-2 font-semibold">
            응급 시 119 또는 가까운 응급의료기관 방문.
          </p>
          <p className="text-[13px]">
            피부텐텐은 응급 의료 안내를 제공하지 않으며, 응급 상황에서 본 서비
            스의 콘텐츠나 검색 결과를 의료 결정의 근거로 삼지 마세요.
          </p>
        </div>
      </Section>

      <Section title="정신건강 위기 시 도움">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="mb-2">
            마음이 힘드시거나 자해·자살 생각이 드신다면 다음 기관에 도움을
            요청하실 수 있습니다.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            <li>
              <strong>자살예방상담전화 109</strong> (24시간, 무료)
            </li>
            <li>
              <strong>정신건강위기상담 1577-0199</strong> (24시간)
            </li>
            <li>
              <strong>청소년상담 1388</strong>
            </li>
          </ul>
        </div>
      </Section>

      <Section title="회원이 작성한 글에 대한 안내">
        <p className="mb-3">
          회원이 작성한 글·댓글은 개인 의견이며 의료 정보가 아닙니다. 시술
          경험·만족도·부작용 등 회원이 자신의 경험을 공유하는 게시물은 다른
          회원에게 동일한 결과를 보장하지 않습니다.
        </p>
        <p>
          회원이 특정 의료기관·의료인·시술·약물을 추천하거나, 시술 전후 비교
          사진을 게시하는 행위는 「의료법」 제56조 등 관련 법령에 따라 금지될 수
          있습니다. 회사는 이러한 게시물을 사전 통지 없이 제한할 수 있습니다.
          자세한 내용은{" "}
          <Link
            href="/terms"
            className="text-[var(--primary)] hover:underline"
          >
            이용약관 제5조·제9조
          </Link>
          를 확인해 주세요.
        </p>
      </Section>

      <Section title="사용자 책임">
        <p>
          회원은 본 서비스의 콘텐츠를 참고하실 때 본인의 의료적 판단에 본인의
          책임이 있다는 것을 이해하고 사용하셔야 합니다. 회사는 회원이 본 서비
          스의 콘텐츠를 근거로 내린 의료적 결정의 결과에 대해 책임지지 않습니다.
        </p>
      </Section>

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
