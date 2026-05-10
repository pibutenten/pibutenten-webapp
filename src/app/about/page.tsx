import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "사이트 안내",
  description:
    "피부텐텐은 피부과 전문의가 함께하는 피부 미용 Q&A SNS입니다. 운영 주체, 콘텐츠 정책, 의료 정보 면책 안내.",
  alternates: { canonical: `${SITE_URL}/about` },
};

/**
 * 사이트 안내 — 운영 주체, 콘텐츠 정책, 의료 면책.
 * (의료법 제56조 의료광고 제한 + YMYL E-E-A-T 신뢰 신호)
 */
export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-[680px] py-2">
      <h1 className="mb-4 text-[26px] font-bold leading-[1.35] text-[var(--text)] sm:text-[30px]">
        사이트 안내
      </h1>
      <p className="mb-8 text-[15px] leading-[1.7] text-[var(--text-secondary)]">
        피부텐텐은 피부과 전문의 9명이 함께 만드는 피부 미용 Q&amp;A SNS입니다.
        사용자가 자유롭게 피부 고민을 나누고, 전문의가 검수된 답변과 칼럼을
        제공합니다.
      </p>

      <Section title="운영 주체">
        <ul className="list-disc space-y-1 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>운영자: 주식회사 진솔컴퍼니</li>
          <li>
            문의:{" "}
            <a
              href="mailto:jminbae@gmail.com"
              className="text-[var(--primary)] hover:underline"
            >
              jminbae@gmail.com
            </a>
          </li>
        </ul>
      </Section>

      <Section title="콘텐츠 정책">
        <ul className="list-disc space-y-2 pl-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          <li>
            <strong className="font-semibold text-[var(--text)]">
              전문의 답변
            </strong>{" "}
            — board-certified 피부과 전문의가 직접 작성·검수한 콘텐츠입니다.
          </li>
          <li>
            <strong className="font-semibold text-[var(--text)]">
              회원 글
            </strong>{" "}
            — 일반 회원이 자유롭게 작성한 개인 의견입니다. 의료 정보가 아니며,
            검색엔진·AI에 의료 정보로 색인되지 않도록 처리합니다.
          </li>
          <li>
            의사·회원 글은 카드 디자인과 뱃지로 구분 표시됩니다.
          </li>
        </ul>
      </Section>

      <Section title="의료 정보 면책">
        <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-4 text-[13.5px] leading-[1.7] text-amber-900">
          <p className="mb-2 font-semibold">전문의 답변에 대한 안내</p>
          <p className="mb-3">
            본 사이트의 전문의 답변은 피부과 전문의가 작성한{" "}
            <strong>일반적인 의학 정보</strong>이며, 개인의 진단·치료를 대체하지
            않습니다. 시술 결정 전 반드시 의료진과 직접 상담하시기 바랍니다.
          </p>
          <p className="mb-2 font-semibold">회원 글에 대한 안내</p>
          <p>
            회원이 작성한 글은 개인 의견이며 의료 정보가 아닙니다. 의료 결정
            시에는 반드시 전문의와 상담하시기 바랍니다.
          </p>
        </div>
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

      <div className="mt-10 flex flex-wrap gap-2 text-[13px]">
        <Link
          href="/"
          className="rounded-md bg-[var(--primary)] px-4 py-2 font-semibold text-white hover:bg-[var(--primary-dark)]"
        >
          홈으로
        </Link>
        <Link
          href="/doctors"
          className="rounded-md border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          전문의 둘러보기
        </Link>
      </div>
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
    <section className="mb-8">
      <h2 className="mb-3 text-[18px] font-bold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}
