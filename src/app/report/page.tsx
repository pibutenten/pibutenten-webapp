import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
import { ReportForm } from "./ReportForm";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import InfoShell from "@/components/info/InfoShell";

export const metadata: Metadata = {
  title: "콘텐츠 신고 — 피부텐텐",
  description:
    "피부텐텐 게시물·댓글에 대한 신고를 접수합니다. 정보통신망법 제44조의2 절차에 따라 처리됩니다.",
  alternates: { canonical: `${SITE_URL}/report` },
  robots: { index: false, follow: false },
  // openGraph/twitter — 다른 정적 페이지(about/contact)와 동일하게 og-meta 헬퍼로 통일 (images 누락 보완).
  ...buildSocialMeta({
    title: "콘텐츠 신고 — 피부텐텐",
    description: "피부텐텐 게시물·댓글에 대한 신고를 접수합니다.",
    canonical: `${SITE_URL}/report`,
    ogImage: buildOgImage(null),
    ogType: "website",
  }),
};

export default function ReportPage() {
  return (
    <InfoShell>
    <InfoPageLayout
      current="report"
      title="콘텐츠 신고"
      subtitle="정보통신망법 제44조의2 절차에 따라 처리됩니다"
    >
      <p className="mb-6 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        피부텐텐의 게시물·댓글이 본 서비스의{" "}
        <Link
          href="/terms"
          className="text-[var(--primary)] hover:underline"
        >
          이용약관
        </Link>
        을 위반하거나 회원님의 권리를 침해한다고 판단되시면 아래 양식으로 신고해
        주세요. 회사는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제44조
        의2에 따라 처리합니다.
      </p>

      <section className="mb-8 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-4 text-[13px] text-[var(--text-secondary)]">
        <p className="mb-2 font-semibold text-[var(--text)]">처리 절차</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>신고 접수 후 24~72시간 이내 검토 개시 (긴급 사안 즉시).</li>
          <li>
            명백한 침해·법령 위반: 즉시 삭제 또는 비공개 처리. 그 외: 30일 이내
            임시조치.
          </li>
          <li>작성자에게 사실 통지. 30일 이내 이의제기 가능.</li>
          <li>이의제기 시 양 당사자 의견 청취 후 게시물의 복원·삭제 결정.</li>
        </ol>
      </section>

      <ReportForm />

      <section className="mt-10 rounded-md border border-[var(--border)] p-4 text-[13px] text-[var(--text-secondary)]">
        <p className="mb-2 font-semibold text-[var(--text)]">
          이메일로 신고하기
        </p>
        <p>
          위 양식 이용이 어려운 경우{" "}
          <a
            href="mailto:pibutenten@gmail.com?subject=%5B%EC%8B%A0%EA%B3%A0%5D%20%ED%94%BC%EB%B6%80%ED%85%90%ED%85%90%20%EC%BD%98%ED%85%90%EC%B8%A0"
            className="text-[var(--primary)] hover:underline"
          >
            pibutenten@gmail.com
          </a>
          으로 신고 대상 URL·사유를 보내 주세요. 동일하게 24~72시간 이내 검토
          개시합니다.
        </p>
      </section>
    </InfoPageLayout>
    </InfoShell>
  );
}
