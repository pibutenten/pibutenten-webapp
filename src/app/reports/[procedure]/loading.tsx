/**
 * /reports/[procedure] — 시술 리포트 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 빈 화면(또는 전역 spinner) 대신 ProcedureReportView 의 실제 세로 구조를 회색 블록으로
 * 재현해 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(ProcedureReportView → ProcedureReportCard 순서와 동일):
 *   샘플 안내 한 줄 → 리포트 카드[ 시술 헤더(라벨·제목·건수) → 재시술 의향(문구+분할바+범례)
 *   → 만족도(별점+분포바) → 통증(게이지+라벨) → 효과/효과시점/작성자 통계 섹션 → 면책 문구
 *   → 개별 후기 리스트(제목 + 행 3개) ].
 *
 * app.module.css 토큰(.root 스코프)은 여기서 못 쓰므로 캔버스 배경·헤더 톤만
 * 인라인으로 복제(루트/record loading.tsx 와 동일 접근). 회색 블록은 Tailwind animate-pulse.
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
        {/* 샘플 안내 한 줄(ReportSampleNotice 자리) — 표본 적을 때만 뜨지만 자리만 가늘게 확보 */}
        <div className="mb-2 ml-1 h-3 w-2/3 animate-pulse rounded bg-slate-200/50" />

        {/* 리포트 카드 — 흰 배경 둥근 모서리(overflow-hidden 카드 1장) */}
        <div className="w-full overflow-hidden rounded-[24px] bg-white">
          {/* 시술 헤더 — '피부텐텐 리포트' 라벨 + 큰 제목 + 우측 건수. 색 배경 톤. */}
          <div className="bg-slate-100/70 px-5 py-4">
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-slate-200/70" />
            <div className="flex items-baseline justify-between gap-3">
              <div className="h-7 w-44 animate-pulse rounded bg-slate-200/80" />
              <div className="h-3.5 w-20 animate-pulse rounded bg-slate-200/60" />
            </div>
          </div>

          {/* 재시술 의향 — 문구 + 분할 막대 + 범례 */}
          <div className="px-5 py-5">
            <div className="mb-5 h-4 w-3/4 animate-pulse rounded bg-slate-200/70" />
            <div className="h-5 w-full animate-pulse rounded-lg bg-slate-200/70" />
            <div className="mt-2 flex gap-3.5">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200/50" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
            </div>
          </div>

          {/* 만족도 — 문구 + (별점 묶음 + 5줄 분포 바) */}
          <div className="px-5 py-5">
            <div className="mb-5 h-4 w-2/3 animate-pulse rounded bg-slate-200/70" />
            <div className="flex items-center gap-4">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70" />
                <div className="h-6 w-10 animate-pulse rounded bg-slate-200/80" />
              </div>
              <div className="flex-1 space-y-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2.5 w-3 animate-pulse rounded bg-slate-200/60" />
                    <div className="h-2.5 flex-1 animate-pulse rounded-full bg-slate-200/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 통증 — 문구 + 게이지 막대 + 라벨 줄 */}
          <div className="px-5 py-5">
            <div className="mb-5 h-4 w-1/2 animate-pulse rounded bg-slate-200/70" />
            <div className="h-2 w-full animate-pulse rounded-full bg-slate-200/70" />
            <div className="mt-2 flex justify-between">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-2.5 w-7 animate-pulse rounded bg-slate-200/50" />
              ))}
            </div>
          </div>

          {/* 효과 — 섹션 제목 + 가로 바 4줄(라벨·바·%) */}
          <div className="px-5 py-5">
            <div className="mb-5 h-4 w-40 animate-pulse rounded bg-slate-200/70" />
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-3 w-[52px] animate-pulse rounded bg-slate-200/70" />
                  <div className="h-2.5 flex-1 animate-pulse rounded-full bg-slate-200/50" />
                  <div className="h-3 w-9 animate-pulse rounded bg-slate-200/60" />
                </div>
              ))}
            </div>
          </div>

          {/* 작성자 통계 — 제목 + 분할 바 + 범례(성별·연령) */}
          <div className="px-5 py-5">
            <div className="mb-5 h-4 w-24 animate-pulse rounded bg-slate-200/70" />
            <div className="h-3.5 w-full animate-pulse rounded-full bg-slate-200/70" />
            <div className="mt-1.5 flex gap-3.5">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-200/50" />
            </div>
            <div className="mt-3 h-3.5 w-full animate-pulse rounded-full bg-slate-200/60" />
          </div>

          {/* 면책 문구 — 작은 글씨 2줄 */}
          <div className="px-5 pb-4">
            <div className="mb-1.5 h-2.5 w-full animate-pulse rounded bg-slate-200/40" />
            <div className="h-2.5 w-5/6 animate-pulse rounded bg-slate-200/40" />
          </div>

          {/* 개별 후기 리스트 — 상단 구분선 + '후기 N개' 제목 + 후기 행 3개 */}
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="mb-5 h-4 w-20 animate-pulse rounded bg-slate-200/80" />
            <div className="divide-y divide-slate-100">
              {[0, 1, 2].map((i) => (
                <div key={i} className="py-3.5">
                  <div className="mb-2 flex items-center gap-2.5">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200/70" />
                    <div className="flex-1">
                      <div className="mb-1.5 h-3 w-28 animate-pulse rounded bg-slate-200/70" />
                      <div className="h-2.5 w-16 animate-pulse rounded bg-slate-200/50" />
                    </div>
                  </div>
                  <div className="mb-1.5 h-3 w-full animate-pulse rounded bg-slate-200/60" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200/50" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
