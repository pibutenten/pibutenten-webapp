/**
 * 홈 페이지 navigation 중 즉시 표시되는 스켈레톤.
 * 태그 칩 클릭, 검색 등으로 페이지가 다시 그려지는 동안 빈 화면 대신 노출.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero/검색바 자리 (실제 헤더는 layout이라 영향 없음) */}
      <div className="my-6 h-12 rounded-full bg-[var(--surface-2,#eef1f5)]" />

      {/* 카테고리/칩 자리 */}
      <div className="mb-3 h-8 rounded bg-[var(--surface-2,#eef1f5)]" />
      <div className="mb-4 flex flex-wrap justify-center gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-16 rounded-full bg-[var(--surface-2,#eef1f5)]"
          />
        ))}
      </div>

      {/* 카드 그리드 자리 — 모바일 1열 / 데스크탑 2열 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] bg-white p-4"
            style={{ minHeight: 180 }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[var(--surface-2,#eef1f5)]" />
              <div className="h-4 w-24 rounded bg-[var(--surface-2,#eef1f5)]" />
            </div>
            <div className="mb-2 h-5 w-4/5 rounded bg-[var(--surface-2,#eef1f5)]" />
            <div className="mb-1 h-4 w-full rounded bg-[var(--surface-2,#eef1f5)]" />
            <div className="mb-1 h-4 w-full rounded bg-[var(--surface-2,#eef1f5)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--surface-2,#eef1f5)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
