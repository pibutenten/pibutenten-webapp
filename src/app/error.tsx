"use client";

/**
 * 세그먼트 에러 바운더리.
 *
 * force-dynamic SSR 라우트의 런타임 예외를 잡아 베타 톤의 한국어 복구 UI 로 대체한다.
 * (없으면 Next.js 기본 영문 에러 화면이 노출되어 베타 스킨 일관성이 깨짐.)
 *
 * - error.tsx 는 root layout 안에서 렌더되므로 globals.css 토큰(--primary 등)을
 *   상속받는다 → not-found.tsx 와 동일하게 Tailwind `var(--*)` 클래스 사용.
 * - global-error.tsx 와 달리 html/body 를 직접 렌더하지 않는다(layout 이 이미 제공).
 */
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 운영 로그(Vercel) 로 예외를 흘려보내 원인 추적이 가능하게 한다.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-[480px] py-10">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
        <h1 className="mb-2 text-lg font-bold text-[var(--text)]">
          일시적인 오류가 발생했어요
        </h1>
        <p className="mb-6 text-sm leading-[1.6] text-[var(--text-secondary)]">
          잠시 후 다시 시도해 주세요.
          <br />
          문제가 계속되면 피드로 돌아가 다른 글을 둘러보셔도 좋아요.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            피드로 가기
          </Link>
        </div>
      </div>
    </section>
  );
}
