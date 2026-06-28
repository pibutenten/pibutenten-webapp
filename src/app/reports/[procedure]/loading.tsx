/**
 * /reports/[procedure] — 시술 리포트 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 빈 화면(또는 전역 spinner) 대신 ReportsDetailView 의 실제 세로 구조를 회색 블록으로
 * 재현해 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(ReportsDetailView 와 동일 순서):
 *   ① 흰 rounded 카드 한 장 — 컬러 히어로(브랜드 배지 + 큰 % + 사람 그리드)
 *      → 만족도(별점 + 분포 막대) → 통증·다운타임 2열 → 효과 막대 → 효과시점 → 작성자 통계.
 *   ② 그 아래 독립 후기 글상자 2개("직접 들어보기" 제목 + 정렬 칩 + 따옴표 후기 카드).
 *
 * above-fold(히어로 카드 + 후기 상자 1~2개)만 대략 맞춰 CLS 를 줄인다(픽셀 동일 불필요).
 * app.module.css 토큰(.root 스코프)은 여기서 못 쓰므로 캔버스 배경·헤더 톤만 인라인으로 복제.
 * 색 토큰은 globals.css 변수(var(--radius-lg)/var(--bg-soft) 등) + Tailwind animate-pulse.
 * 우측 사이드바는 AppShell 이 렌더하므로 본문 흐름(최대 820px)만 재현.
 * 서버 컴포넌트라 "use client"·훅·데이터 호출 없음(순수 마크업).
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="불러오는 중"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90, // 앱 셸(.root z-index:100)이 뜨면 그 아래로 가려짐
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        // 앱 캔버스와 동일한 그라데이션으로 시작 → 회색 깜빡임 차단
        background:
          "linear-gradient(168deg, #e8f5fd 0%, #ecf7f2 52%, #faf5e2 100%)",
      }}
    >
      <span className="sr-only">불러오는 중</span>

      {/* 앱 헤더(#e8f5fd) 톤의 얇은 상단 막대 — 셸 헤더 자리와 시각적으로 연결(높이 56) */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          backgroundColor: "#e8f5fd",
          borderBottom: "1px solid #edf2f5",
        }}
      />

      {/* 본문 — .page/.layoutSingle 폭(최대 820px) + 좌우 패딩 재현. */}
      <div
        aria-hidden="true"
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 820,
          margin: "0 auto",
          padding: "16px 18px 0",
        }}
      >
        {/* ── ① 리포트 카드(한 장) — 흰 배경, 둥근 모서리 ── */}
        <div className="w-full overflow-hidden rounded-[var(--radius-lg)] bg-white">
          {/* 히어로 — 컬러 톤 배경. 브랜드 배지 → 큰 제목 → 큰 % → 사람 그리드. 가운데 정렬. */}
          <div className="flex flex-col items-center bg-[var(--bg-soft)] px-5 pb-7 pt-7">
            {/* 브랜드 배지(로고 + '리포트') */}
            <div className="h-[26px] w-[120px] animate-pulse rounded-full bg-slate-200/70" />
            {/* 시술명(큰 제목) */}
            <div className="mt-4 h-9 w-48 animate-pulse rounded-lg bg-slate-200/80" />
            {/* 한 줄 요약 */}
            <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded bg-slate-200/50" />
            {/* 재시술의향 라벨 + 큰 % */}
            <div className="mt-7 h-3 w-16 animate-pulse rounded bg-slate-200/60" />
            <div className="mt-3 h-[72px] w-36 animate-pulse rounded-2xl bg-slate-200/70" />
            {/* 사람 그리드(9열) */}
            <div className="mt-5 grid w-full max-w-[300px] grid-cols-9 gap-x-[6px] gap-y-[7px]">
              {Array.from({ length: 27 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-sm bg-slate-200/50" />
              ))}
            </div>
            <div className="mt-3.5 h-3 w-52 animate-pulse rounded bg-slate-200/40" />
          </div>

          {/* 만족도 — 아이브로 + 헤드라인 + 큰 점수 + 5줄 분포 막대 */}
          <div className="px-5 py-6">
            <div className="mb-1.5 h-2.5 w-16 animate-pulse rounded bg-slate-200/60" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-4 h-10 w-24 animate-pulse rounded-lg bg-slate-200/80" />
            <div className="mt-5 flex flex-col gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-2.5 w-7 shrink-0 animate-pulse rounded bg-slate-200/60" />
                  <div className="h-2 flex-1 animate-pulse rounded-full bg-slate-200/50" />
                  <div className="h-2.5 w-10 shrink-0 animate-pulse rounded bg-slate-200/50" />
                </div>
              ))}
            </div>
          </div>

          {/* 통증 · 다운타임 — 헤드라인 + 2열 */}
          <div className="px-5 py-6">
            <div className="mb-1.5 h-2.5 w-24 animate-pulse rounded bg-slate-200/60" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-5 grid grid-cols-2 gap-4">
              {[0, 1].map((col) => (
                <div key={col}>
                  <div className="mb-2 h-3 w-20 animate-pulse rounded bg-slate-200/60" />
                  <div className="h-2 w-full animate-pulse rounded-full bg-slate-200/70" />
                  <div className="mt-1.5 flex justify-between">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-2 w-5 animate-pulse rounded bg-slate-200/40" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 효과 — 아이브로 + 헤드라인 + 가로 막대 4줄(라벨·바·%) */}
          <div className="px-5 py-6">
            <div className="mb-1.5 h-2.5 w-14 animate-pulse rounded bg-slate-200/60" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3.5 w-[58px] shrink-0 animate-pulse rounded bg-slate-200/70" />
                  <div className="h-2.5 flex-1 animate-pulse rounded-full bg-slate-200/50" />
                  <div className="h-3.5 w-10 shrink-0 animate-pulse rounded bg-slate-200/60" />
                </div>
              ))}
            </div>
          </div>

          {/* 효과시점 — 아이브로 + 헤드라인 + 타임라인 막대 */}
          <div className="px-5 py-6">
            <div className="mb-1.5 h-2.5 w-16 animate-pulse rounded bg-slate-200/60" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200/70" />
            <div className="mt-5 h-12 w-full animate-pulse rounded-lg bg-slate-200/50" />
          </div>

          {/* 작성자 통계 — 제목 + 성별 분할바 + 범례 + 연령 분할바 */}
          <div className="px-5 py-6">
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-slate-200/70" />
            <div className="h-[18px] w-full animate-pulse rounded-full bg-slate-200/70" />
            <div className="mt-2 flex gap-4">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
            </div>
            <div className="mt-4 h-[18px] w-full animate-pulse rounded-full bg-slate-200/60" />
          </div>
        </div>

        {/* ── ② 직접 들어보기 — 제목(카드 밖) + 정렬 칩 + 독립 후기 글상자 2개 ── */}
        <div className="mt-4">
          {/* 아이브로 + 제목 */}
          <div className="px-1">
            <div className="mb-1.5 h-2.5 w-20 animate-pulse rounded bg-slate-200/60" />
            <div className="h-5 w-40 animate-pulse rounded bg-slate-200/70" />
          </div>
          {/* 정렬 칩 4개 */}
          <div className="mt-3 flex gap-1.5 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-slate-200/60" />
            ))}
          </div>
          {/* 후기 글상자 2개 — 따옴표 + 본문 2줄 + 아바타·이름 + 만족도 별 + 푸터 */}
          <div className="mt-2.5 flex flex-col gap-2.5">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl bg-white p-5">
                <div className="h-5 w-5 animate-pulse rounded bg-slate-200/60" />
                <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-slate-200/60" />
                <div className="mt-1.5 h-3.5 w-5/6 animate-pulse rounded bg-slate-200/50" />
                <div className="mt-4 flex items-center gap-2.5">
                  <div className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-full bg-slate-200/70" />
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-200/60" />
                  <div className="ml-auto h-3 w-20 animate-pulse rounded bg-slate-200/50" />
                </div>
                <div className="mt-3.5 flex gap-[18px]">
                  <div className="h-4 w-8 animate-pulse rounded bg-slate-200/40" />
                  <div className="h-4 w-8 animate-pulse rounded bg-slate-200/40" />
                  <div className="ml-auto h-4 w-5 animate-pulse rounded bg-slate-200/40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
