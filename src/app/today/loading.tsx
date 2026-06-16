/**
 * /today — 투데이 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 빈 화면(또는 전역 spinner) 대신 RecordView 의 실제 세로 구조를 회색 블록으로 재현해
 * 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(회원 화면 기준, RecordView 순서와 동일):
 *   날씨 카드 → 히어로(greetCard) → 대시보드(statCard 4칸) → 시술 노트(제목+카드들)
 *   → 관심 키워드(섹션헤더+칩줄+가로 카드 3) → 인기글(제목+토글+행 5).
 *
 * app.module.css 토큰(.root 스코프)은 여기서 못 쓰므로 캔버스 배경·헤더 톤만
 * 인라인으로 복제(루트 loading.tsx 와 동일 접근). 회색 블록은 Tailwind animate-pulse.
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
        {/* 날씨 카드 */}
        <div className="mb-3 h-[92px] w-full animate-pulse rounded-[24px] bg-white/70" />

        {/* 히어로(greetCard) — 그라데이션 카드 자리. 제목 2줄 + 부제 + 버튼 줄 높이감. */}
        <div className="mb-2 w-full animate-pulse rounded-[24px] bg-white/60 p-[22px]">
          <div className="mb-3 h-3.5 w-28 rounded bg-slate-200/70" />
          <div className="mb-2 h-5 w-3/4 rounded bg-slate-200/80" />
          <div className="mb-4 h-5 w-1/2 rounded bg-slate-200/80" />
          <div className="mb-4 h-3 w-5/6 rounded bg-slate-200/60" />
          <div className="flex gap-2.5">
            <div className="h-9 w-28 rounded-[16px] bg-slate-200/70" />
            <div className="h-9 w-28 rounded-[16px] bg-slate-200/60" />
            <div className="h-9 w-28 rounded-[16px] bg-slate-200/60" />
          </div>
        </div>

        {/* 대시보드(statCard) — 4칸 숫자/라벨 */}
        <div className="mt-[18px] mb-5 w-full animate-pulse rounded-[24px] bg-white p-[15px_14px]">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="mb-1.5 h-7 w-10 rounded bg-slate-200/80" />
                <div className="h-3 w-14 rounded bg-slate-200/60" />
              </div>
            ))}
          </div>
        </div>

        {/* 시술 노트 — 섹션 제목 + 미리보기 카드 2개 */}
        <div className="mt-6 mb-3.5 ml-1 h-4 w-24 animate-pulse rounded bg-slate-200/80" />
        {[0, 1].map((i) => (
          <div
            key={i}
            className="mb-3 w-full animate-pulse rounded-[24px] bg-white p-[22px]"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-slate-200/80" />
              <div className="h-5 w-20 rounded-full bg-slate-200/60" />
            </div>
            <div className="mb-3 h-3 w-1/2 rounded bg-slate-200/60" />
            <div className="h-3 w-5/6 rounded bg-slate-200/50" />
          </div>
        ))}

        {/* 관심 키워드 새 글 — 섹션헤더 + 칩줄 + 가로 카드 3개 */}
        <div className="mt-[34px] mb-4 flex items-baseline justify-between px-1">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200/80" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200/60" />
        </div>
        <div className="mb-2 flex gap-2 overflow-hidden px-0.5 py-2.5">
          {[64, 52, 72, 48, 60].map((w, i) => (
            <div
              key={i}
              className="h-8 flex-none animate-pulse rounded-full bg-white/70"
              style={{ width: w }}
            />
          ))}
        </div>
        <div className="flex gap-3.5 overflow-hidden px-0.5 py-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[148px] w-[240px] flex-none animate-pulse rounded-[24px] bg-white p-5"
            >
              <div className="mb-3 h-3 w-14 rounded bg-slate-200/70" />
              <div className="mb-2 h-4 w-full rounded bg-slate-200/80" />
              <div className="mb-5 h-4 w-2/3 rounded bg-slate-200/70" />
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-slate-200/70" />
                <div className="flex-1">
                  <div className="mb-1.5 h-3 w-20 rounded bg-slate-200/70" />
                  <div className="h-2.5 w-16 rounded bg-slate-200/50" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 인기글 — 제목 + 7/30/90 토글 + 행 5개 */}
        <div className="mt-6 mb-3.5 flex items-center justify-between px-1">
          <div className="h-4 w-16 animate-pulse rounded bg-slate-200/80" />
          <div className="h-8 w-36 animate-pulse rounded-full bg-white/70" />
        </div>
        <div className="w-full animate-pulse rounded-[24px] bg-white px-[18px] py-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
            >
              <div className="h-5 w-5 flex-none rounded bg-slate-200/70" />
              <div className="flex-1">
                <div className="mb-1.5 h-3.5 w-3/4 rounded bg-slate-200/80" />
                <div className="h-2.5 w-1/3 rounded bg-slate-200/50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
