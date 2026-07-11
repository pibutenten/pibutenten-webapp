/**
 * /doctors/[slug] — 원장 공개 프로필 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic: doctor 조회 + 카드 풀 +
 * viewer + 인기 Q&A) 동안 이 파일을 즉시 렌더한다. 빈 화면 대신 DoctorProfileView 의
 * 실제 세로 구조를 회색 블록으로 재현해 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(AppShell + DoctorProfileView 기준):
 *   상단 헤더 막대(56) → backRow('< 뒤로' + "원장님의 답변 N편" 제목)
 *   → 2단 레이아웃:
 *       · 메인(좌): 단일열 PostCard 피드(홈과 동일 톤) — 카드 행 N개.
 *       · 사이드바(우, 데스크탑만): 원장 카드(메시지 + 이름 + 배지 + 누끼 사진)
 *         + "함께 보면 좋은 Q&A" 섹션.
 *   데스크탑은 2단, 모바일은 셸이 1단(사이드바는 피드 아래) — 스켈레톤은 데스크탑 기준
 *   2단을 flex 로 재현하되 좁은 화면에서도 자연스럽게 줄바꿈(flex-wrap)되게 둔다.
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
          "#f5fbff",
      }}
    >
      {/* 앱 헤더(#e8f5fd) 톤의 얇은 상단 막대 — 셸 헤더 자리와 시각적으로 연결(높이 56) */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          backgroundColor: "#f5fbff",
          borderBottom: "1px solid #edf2f5",
        }}
      />

      {/* 본문 — .page 폭(최대 1080px, 2단) 재현. 좌우 패딩 + 중앙 정렬. */}
      <div
        aria-hidden="true"
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1080,
          margin: "0 auto",
          padding: "16px 18px 0",
        }}
      >
        {/* backRow — '< 뒤로' 화살표 + "○○ 원장님의 답변 N편" 제목 */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="h-7 w-7 animate-pulse rounded-full bg-white/70" />
          <div className="h-5 w-52 animate-pulse rounded bg-slate-200/80" />
        </div>

        {/* 2단 레이아웃 — 메인(좌, 넓게) + 사이드바(우). 좁은 화면은 wrap 으로 1단화. */}
        <div className="flex flex-wrap gap-6">
          {/* ===== 메인(좌): 단일열 PostCard 피드 ===== */}
          <div className="min-w-[280px] flex-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="mb-3.5 w-full animate-pulse rounded-[24px] bg-white p-[22px]"
              >
                {/* 카드 상단 — 카테고리 딱지 + 우측 메뉴 점 */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-5 w-16 rounded-full bg-slate-200/70" />
                  <div className="h-5 w-5 rounded bg-slate-200/50" />
                </div>
                {/* 제목 2줄 */}
                <div className="mb-2 h-4 w-5/6 rounded bg-slate-200/80" />
                <div className="mb-3.5 h-4 w-2/3 rounded bg-slate-200/70" />
                {/* 본문 미리보기 2줄 */}
                <div className="mb-2 h-3 w-full rounded bg-slate-200/55" />
                <div className="mb-5 h-3 w-4/5 rounded bg-slate-200/50" />
                {/* 하단 메타 — 작성자 아바타 + 이름 + 좋아요/댓글 */}
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-slate-200/70" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-3 w-24 rounded bg-slate-200/70" />
                    <div className="h-2.5 w-16 rounded bg-slate-200/50" />
                  </div>
                  <div className="h-4 w-10 rounded bg-slate-200/50" />
                  <div className="h-4 w-10 rounded bg-slate-200/50" />
                </div>
              </div>
            ))}
          </div>

          {/* ===== 사이드바(우): 원장 카드 + 함께 보면 좋은 Q&A ===== */}
          <div className="w-full md:w-[300px] md:flex-none">
            {/* 원장 카드 — 메시지(intro) + 이름(H1) + "피부과 전문의" 배지 + 누끼 사진 */}
            <div className="mb-4 w-full animate-pulse rounded-[24px] bg-white p-[22px] text-center">
              {/* 한줄 메시지 */}
              <div className="mx-auto mb-3 h-3 w-4/5 rounded bg-slate-200/60" />
              {/* 이름(H1) */}
              <div className="mx-auto mb-2.5 h-6 w-32 rounded bg-slate-200/80" />
              {/* 피부과 전문의 배지 */}
              <div className="mx-auto mb-4 h-5 w-28 rounded-full bg-slate-200/60" />
              {/* 누끼 원장 사진 — 정사각 영역 */}
              <div className="mx-auto h-[200px] w-[200px] rounded-[20px] bg-slate-200/60" />
              {/* 더보기 토글 */}
              <div className="mx-auto mt-4 h-3 w-14 rounded bg-slate-200/50" />
            </div>

            {/* 함께 보면 좋은 Q&A — 제목 + 링크 행 4개 */}
            <div className="w-full animate-pulse rounded-[24px] bg-white p-[20px]">
              <div className="mb-4 h-4 w-36 rounded bg-slate-200/80" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="mb-3 flex items-start gap-2.5 last:mb-0">
                  <div className="mt-0.5 h-5 w-5 flex-none rounded bg-slate-200/70" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-3 w-full rounded bg-slate-200/70" />
                    <div className="h-3 w-2/3 rounded bg-slate-200/50" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
