import Link from "next/link";

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
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
          >
            피드로 가기
          </Link>
          <Link
            href="/doctors"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            전문의 둘러보기
          </Link>
        </div>
      </div>
    </section>
  );
}
