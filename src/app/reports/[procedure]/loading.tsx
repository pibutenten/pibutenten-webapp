/**
 * /reports/[procedure] — 시술 리포트 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 공유 layout(reports/layout.tsx)의 AppShell 이 상단바·우측 사이드바·캔버스 배경을 상시
 * persist 하므로, 이 스켈레톤은 **본문 슬롯(feedCol) 콘텐츠만** 회색 블록으로 재현한다
 * (풀뷰포트 fixed 오버레이·가짜 헤더 없음 — 셸이 이미 그 자리를 채움).
 *
 * 구조(2026-07-08 신레이아웃 — ReportsDetailView 와 동일 순서):
 *   ① 흰 rounded-24 카드 한 장 — 그라데이션 히어로(라벨·큰 제목·태그·큰 %·사람 그리드 10열)
 *      → SATISFACTION(좌 큰 숫자+별 / 우 분포 5줄) → PAIN & RECOVERY(바 2개+마커)
 *      → RESULTS 막대 → TIMELINE 세로 막대 4개 → 작성자 통계 띠 2개.
 *   ② (배경 #EAF2F8 패널) 리뷰 제목 + 정렬 칩 + 따옴표 후기 카드 2개.
 *
 * 서버 컴포넌트라 "use client"·훅·데이터 호출 없음(순수 마크업). 색 토큰은 globals.css 변수
 * + Tailwind animate-pulse. 하단 패널 풀블리드(-mx-[18px])는 본문과 동일 규칙.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <span className="sr-only">불러오는 중</span>

      {/* ── ① 리포트 카드(한 장, 라운드 24) ── */}
      <div className="w-full overflow-hidden rounded-[24px] bg-white">
        {/* 히어로 — 그라데이션 자리(회색 톤). 라벨 → 큰 제목 → 태그 3 → 큰 % → 사람 그리드. */}
        <div className="rounded-[24px] bg-slate-200/60 px-6 pb-6 pt-7">
          <div className="h-3.5 w-24 animate-pulse rounded bg-white/50" />
          <div className="mt-3 h-10 w-44 animate-pulse rounded-lg bg-white/60" />
          <div className="mt-4 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-white/50" />
            ))}
          </div>
          <div className="mt-7 h-3.5 w-16 animate-pulse rounded bg-white/50" />
          <div className="mt-2 h-[64px] w-40 animate-pulse rounded-2xl bg-white/60" />
          <div className="mt-4 grid grid-cols-10 gap-x-[7px] gap-y-[8px]">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-full bg-white/40" />
            ))}
          </div>
          <div className="mt-4 h-3 w-56 animate-pulse rounded bg-white/40" />
          <div className="mt-2.5 h-4 w-2/3 animate-pulse rounded bg-white/50" />
        </div>

        {/* SATISFACTION — 좌 큰 숫자+별 / 우 분포 5줄 */}
        <div className="px-5 pt-8">
          <div className="mb-1.5 h-2.5 w-24 animate-pulse rounded bg-slate-200/60" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200/70" />
          <div className="mt-5 flex items-center gap-6">
            <div className="shrink-0">
              <div className="h-11 w-24 animate-pulse rounded-lg bg-slate-200/80" />
              <div className="mt-2.5 h-4 w-24 animate-pulse rounded bg-slate-200/60" />
            </div>
            <div className="flex flex-1 flex-col gap-[7px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2.5 w-6 shrink-0 animate-pulse rounded bg-slate-200/60" />
                  <div className="h-2 flex-1 animate-pulse rounded-[6px] bg-slate-200/50" />
                  <div className="h-2.5 w-8 shrink-0 animate-pulse rounded bg-slate-200/50" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PAIN & RECOVERY — 바 2개(마커 원) */}
        <div className="px-5 pt-8">
          <div className="mb-1.5 h-2.5 w-28 animate-pulse rounded bg-slate-200/60" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200/70" />
          {[0, 1].map((row) => (
            <div key={row} className="mt-6">
              <div className="h-3.5 w-40 animate-pulse rounded bg-slate-200/60" />
              <div className="relative mt-5 h-[10px] animate-pulse rounded-[6px] bg-slate-200/70">
                <div className="absolute right-6 top-1/2 h-[26px] w-[26px] -translate-y-1/2 rounded-full border-2 border-slate-200 bg-white" />
              </div>
              <div className="mt-2.5 flex justify-between">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-2.5 w-6 animate-pulse rounded bg-slate-200/40" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* RESULTS — 효과 막대 */}
        <div className="px-5 pt-8">
          <div className="mb-1.5 h-2.5 w-16 animate-pulse rounded bg-slate-200/60" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-slate-200/70" />
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3.5 w-[64px] shrink-0 animate-pulse rounded bg-slate-200/70" />
                <div className="h-[10px] flex-1 animate-pulse rounded-[6px] bg-slate-200/50" />
                <div className="h-3.5 w-11 shrink-0 animate-pulse rounded bg-slate-200/60" />
              </div>
            ))}
          </div>
        </div>

        {/* TIMELINE — 세로 막대 4개 + 축 */}
        <div className="px-5 pt-8">
          <div className="mb-1.5 h-2.5 w-20 animate-pulse rounded bg-slate-200/60" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200/70" />
          <div className="mt-6 grid grid-cols-4 items-end gap-2">
            {[36, 110, 60, 20].map((h, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="h-3 w-8 animate-pulse rounded bg-slate-200/50" />
                <div
                  className="mt-1.5 w-[40px] animate-pulse rounded-t-full bg-slate-200/60"
                  style={{ height: h }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 h-px w-full bg-slate-200/60" />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mx-auto h-2.5 w-12 animate-pulse rounded bg-slate-200/40" />
            ))}
          </div>
        </div>

        {/* 작성자 통계 — 띠 2개 */}
        <div className="mx-5 mt-8 border-t border-slate-100 pb-8 pt-7">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200/70" />
          <div className="mt-4 h-3 w-10 animate-pulse rounded bg-slate-200/50" />
          <div className="mt-2 h-[36px] w-full animate-pulse rounded-full bg-slate-200/70" />
          <div className="mt-5 h-3 w-12 animate-pulse rounded bg-slate-200/50" />
          <div className="mt-2 h-[36px] w-full animate-pulse rounded-full bg-slate-200/60" />
        </div>
      </div>

      {/* ── ② 리뷰 패널(#EAF2F8 자리) — 제목 + 정렬 칩 + 따옴표 후기 카드 2개 ── */}
      <div className="-mx-[18px] mt-8 bg-slate-100/70 px-[18px] pb-6 pt-7 min-[900px]:mx-0 min-[900px]:rounded-[24px] min-[900px]:px-6">
        <div className="px-1">
          <div className="h-5 w-56 animate-pulse rounded bg-slate-200/70" />
        </div>
        <div className="mt-3 flex gap-1.5 px-1 py-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-white/80" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-[16px] bg-white p-5">
              <div className="h-6 w-6 animate-pulse rounded bg-slate-200/60" />
              <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-slate-200/60" />
              <div className="mt-1.5 h-3.5 w-5/6 animate-pulse rounded bg-slate-200/50" />
              <div className="mt-5 flex items-center gap-3">
                <div className="h-[42px] w-[42px] shrink-0 animate-pulse rounded-full bg-slate-200/70" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-200/60" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-slate-200/50" />
                </div>
                <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-slate-200/50" />
              </div>
              <div className="mt-4 flex gap-[18px]">
                <div className="h-4 w-8 animate-pulse rounded bg-slate-200/40" />
                <div className="h-4 w-8 animate-pulse rounded bg-slate-200/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
