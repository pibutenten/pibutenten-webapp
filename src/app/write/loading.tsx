/**
 * /write — 글쓰기 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 빈 화면(또는 전역 spinner) 대신 WriteView 의 실제 세로 구조를 회색 블록으로 재현해
 * 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(어느 탭이 와도 자연스러운 탭-비의존 범용 스켈레톤, WriteView 순서와 동일):
 *   글 유형 탭 카드 줄(3칸) → 폼 카드(제목 + 범용 입력/블록 placeholder 몇 줄)
 *   → 저장 버튼.
 *
 * ⚠️ 기본 진입 탭은 시술후기(ReviewForm)다(WriteView tabToKey default "review"). 단,
 * 탭은 사용자가 시술노트·시술후기·끄적끄적 중 무엇으로든 진입·전환할 수 있으므로 폼 본문
 * 스켈레톤은 특정 폼 전용 라벨·블록 구조에 의존하지 않는 범용 형태(제목 한 줄 + 입력칸/블록
 * placeholder 몇 줄)로 둔다. 어느 탭이 렌더돼도 레이아웃 점프(CLS)가 과하지 않도록 한 것.
 *
 * 폼 본문은 자체 max-width 680px 중앙 정렬(WriteView 의 .writeWrap 내부 폼 폭). 탭 카드 줄은
 * 셸 본문(.layoutSingle, 최대 820px) 폭에 맞춘다. 폼 자체는 클라이언트 렌더라 스켈레톤
 * 가치는 중간 정도지만, 입력 영역의 대략적 레이아웃을 반영해 전환 깜빡임·쏠림을 줄인다.
 *
 * app.module.css 토큰(.root 스코프)은 여기서 못 쓰므로 캔버스 배경·헤더 톤만
 * 인라인으로 복제(루트/record loading.tsx 와 동일 접근). 회색 블록은 Tailwind animate-pulse.
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
        {/* 글 유형 탭 카드 줄 — .writeTypes(repeat(3,1fr)) + .wt(둥근 16px, 제목+설명) 재현. */}
        <div className="mb-[18px] grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex animate-pulse flex-col items-center rounded-[16px] bg-white px-2 py-3"
            >
              <div className="mb-1.5 h-3.5 w-14 rounded bg-slate-200/80" />
              <div className="h-2.5 w-20 rounded bg-slate-200/60" />
            </div>
          ))}
        </div>

        {/* 폼 본문 — 폼 공통 max-w-[680px] 중앙 정렬 폭 재현. 어느 탭이 와도 맞는 범용 구조. */}
        <div className="mx-auto w-full max-w-[680px]">
          {/* 폼 제목(h1) — 중앙 한 줄. */}
          <div className="mb-5 flex justify-center">
            <div className="h-5 w-52 animate-pulse rounded bg-slate-200/80" />
          </div>

          {/* 메인 글상자(formBox) — 흰 카드 안 범용 입력 블록(라벨 + 입력칸) 몇 줄.
              특정 탭(시술노트/시술후기/끄적끄적) 전용 라벨·구조에 의존하지 않는다. */}
          <div className="w-full animate-pulse rounded-[24px] bg-white p-[22px]">
            {/* 입력 블록 1 — 라벨 + 입력칸 1줄 */}
            <div className="mb-5">
              <div className="mb-2 h-3.5 w-32 rounded bg-slate-200/70" />
              <div className="h-11 w-full rounded-[12px] bg-slate-200/50" />
            </div>

            {/* 입력 블록 2 — 라벨 + 입력칸 1줄 */}
            <div className="mb-5">
              <div className="mb-2 h-3.5 w-36 rounded bg-slate-200/70" />
              <div className="h-11 w-full rounded-[12px] bg-slate-200/50" />
            </div>

            {/* 입력 블록 3 — 라벨 + 입력칸 1줄 */}
            <div className="mb-5">
              <div className="mb-2 h-3.5 w-40 rounded bg-slate-200/70" />
              <div className="h-11 w-full rounded-[12px] bg-slate-200/50" />
            </div>

            {/* 본문 블록 — 라벨 + 넓은 textarea 자리(어느 폼에든 있는 긴 입력 영역) */}
            <div>
              <div className="mb-2 h-3.5 w-36 rounded bg-slate-200/70" />
              <div className="h-[120px] w-full rounded-[12px] bg-slate-200/50" />
            </div>
          </div>

          {/* 저장 버튼 — 중앙 알약 버튼 자리. */}
          <div className="mt-5 flex justify-center">
            <div className="h-11 w-44 animate-pulse rounded-[12px] bg-slate-200/70" />
          </div>
        </div>
      </div>
    </div>
  );
}
