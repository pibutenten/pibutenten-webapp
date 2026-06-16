/**
 * /doctor — 원장 대시보드 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic: getUser → resolveActiveIdentity
 * → doctorRow/KPI/검색/태그 prefetch) 동안 이 파일을 즉시 렌더한다. 빈 화면 대신
 * DoctorDashboardView 의 실제 세로 구조를 회색 블록으로 재현해 레이아웃 쏠림(CLS)을 줄이고
 * 체감 로딩을 빠르게 한다. 이 페이지는 영구 noindex 대시보드다.
 *
 * 구조(DoctorDashboardView 순서와 동일):
 *   계정 스위처 → 대시보드 헤더(제목+부제) → 내 글 활동(헤더+기간칩 6 + KPI 카드 6)
 *   → 운영 프로그램(헤더 + Tool 카드 5 + 안내문) → 인기 검색어/태그(카드 2, 각 헤더+칩+순위 그리드).
 *
 * app.module.css 토큰(.root 스코프)은 여기서 못 쓰므로 캔버스 배경·헤더 톤만
 * 인라인으로 복제(record/loading.tsx 와 동일 접근). 회색 블록은 Tailwind animate-pulse.
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

      {/* 본문 — .page/.layoutSingle 폭(최대 820px) + 좌우 패딩 재현. 카드 흰 배경·둥근 모서리. */}
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
        {/* 계정 스위처(compact) — 한 줄 카드 */}
        <div className="mb-5 h-[60px] w-full animate-pulse rounded-[24px] bg-white/70" />

        {/* 대시보드 헤더 — 제목(2xl) + 부제 */}
        <div className="mb-5 pl-1">
          <div className="mb-2 h-7 w-44 animate-pulse rounded bg-slate-200/80" />
          <div className="h-3 w-60 animate-pulse rounded bg-slate-200/60" />
        </div>

        {/* 1) 내 글 활동 — 섹션 헤더 + 기간 칩 6개 + KPI 카드 6개(3열, lg 6열) */}
        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200/80" />
            <div className="flex flex-wrap gap-1">
              {[40, 32, 36, 36, 32, 36].map((w, i) => (
                <div
                  key={i}
                  className="h-5 animate-pulse rounded-full bg-white/70"
                  style={{ width: w }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-[16px] border border-slate-100 bg-white p-4"
              >
                <div className="mb-2 h-3 w-10 rounded bg-slate-200/60" />
                <div className="h-7 w-12 rounded bg-slate-200/80" />
              </div>
            ))}
          </div>
        </div>

        {/* 2) 운영 프로그램 — 섹션 헤더 + Tool 카드 5개(1열, sm 2열) + 안내문 */}
        <div className="mb-6">
          <div className="mb-3 h-4 w-24 animate-pulse rounded bg-slate-200/80" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-[16px] border border-slate-100 bg-white p-4"
              >
                <div className="h-8 w-8 flex-none rounded bg-slate-200/70" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 h-3.5 w-28 rounded bg-slate-200/80" />
                  <div className="h-3 w-4/5 rounded bg-slate-200/50" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-200/50" />
        </div>

        {/* 3) 인기 검색어 / 태그 사용량 — 카드 2개(1열, md 2열). 각 헤더+칩 + 순위 그리드(3열×10행). */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((c) => (
            <div
              key={c}
              className="animate-pulse rounded-[16px] border border-slate-100 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="h-4 w-20 rounded bg-slate-200/80" />
                <div className="h-7 w-44 rounded-[8px] bg-white/80" />
              </div>
              <div className="grid grid-flow-col [grid-template-columns:repeat(3,minmax(0,1fr))] [grid-template-rows:repeat(10,1.5rem)] gap-x-3">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="h-3 flex-1 rounded bg-slate-200/60" />
                    <div className="h-2.5 w-5 flex-none rounded bg-slate-200/40" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
