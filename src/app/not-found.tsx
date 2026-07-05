import type { Metadata } from "next";
import Link from "next/link";

// 인앱 클라 내비게이션으로 not-found 가 렌더될 때도 noindex 를 명시.
//   (직접 진입/문서 요청의 진짜 404 상태코드는 middleware.ts 의 notFoundHtmlResponse 가 담당 —
//    스트리밍 경계 때문에 페이지 레벨 notFound() 로는 200 이 확정되므로. 이 메타는 보강 신호.)
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="mx-auto w-full max-w-[480px] py-10">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
        <div className="mb-4 text-5xl">🔎</div>
        <h1 className="mb-2 text-lg font-bold text-[var(--text)]">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mb-6 text-sm leading-[1.6] text-[var(--text-secondary)]">
          주소가 잘못되었거나 페이지가 삭제된 것 같아요.
          <br />
          피부텐텐 피드에서 다른 좋은 글을 둘러보세요.
        </p>
        {/* 주 CTA(피드로 가기)를 강조 — 모바일 풀폭·큰 패딩·그림자로 시선 유도.
            전문의 둘러보기는 보조(외곽선) 링크로 유지. */}
        <div className="flex flex-col gap-2.5">
          <Link
            href="/"
            className="rounded-lg bg-[var(--primary)] px-5 py-3 text-[15px] font-bold text-white shadow-[0_2px_8px_rgba(76,191,242,0.35)] transition-colors hover:bg-[var(--primary-dark)]"
          >
            피드로 가기
          </Link>
          <Link
            href="/doctors"
            className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            전문의 둘러보기
          </Link>
        </div>
      </div>
    </section>
  );
}
