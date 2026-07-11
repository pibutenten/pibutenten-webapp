/**
 * /[handle] — 공개 프로필 라우트 스켈레톤(서버 컴포넌트).
 *
 * App Router 가 page.tsx 의 서버 데이터 로딩(force-dynamic) 동안 이 파일을 즉시 렌더한다.
 * 빈 화면(또는 전역 spinner) 대신 ProfileView 의 실제 세로 구조를 회색 블록으로 재현해
 * 레이아웃 쏠림(CLS)을 줄이고 체감 로딩을 빠르게 한다.
 *
 * 구조(공개 프로필 기준, ProfileView 순서와 동일):
 *   프로필 헤더 카드(가운데 아바타 + 이름 + @handle + 소개)
 *   → 탭 카드(탭 칩 줄 + 콘텐츠 영역에 피드 카드 2~3개).
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
        {/* 프로필 헤더 카드 — 가운데 정렬: 아바타(84px 원) + 이름 + @handle + 소개 2줄 */}
        <div className="mb-[18px] w-full animate-pulse rounded-[24px] bg-white p-[22px]">
          <div className="flex flex-col items-center">
            {/* 아바타 84px 원 (authorSideAvatarWrap, mb 12) */}
            <div className="mb-3 h-[84px] w-[84px] rounded-full bg-slate-200/80" />
            {/* 이름 (profileName 18/800, marginTop 10) */}
            <div className="mt-2.5 h-5 w-36 rounded bg-slate-200/80" />
            {/* @handle (profileSub 13) */}
            <div className="mt-2 h-3 w-24 rounded bg-slate-200/60" />
            {/* 소개 2줄 (muted, marginTop 8, maxWidth 420) */}
            <div className="mt-3 h-3 w-64 rounded bg-slate-200/50" />
            <div className="mt-1.5 h-3 w-48 rounded bg-slate-200/50" />
          </div>
        </div>

        {/* 탭 카드 — 탭 칩 줄(4칸) + 콘텐츠 영역에 피드 카드 2~3개 */}
        <div className="mb-[18px] w-full animate-pulse rounded-[24px] bg-white p-[22px]">
          {/* 탭 칩 줄 (myTabs, gap 6, mb 14) — 작성 글 / 내 후기 / 댓글 / 내 피부 */}
          <div className="mb-3.5 flex gap-1.5">
            {[64, 64, 52, 60].map((w, i) => (
              <div
                key={i}
                className="h-9 flex-1 rounded-[10px] bg-slate-200/70"
                style={{ maxWidth: w }}
              />
            ))}
          </div>

          {/* 콘텐츠 영역 (marginTop 14) — 피드 리스트(feedList gap 18) 카드 3개 */}
          <div className="mt-3.5 flex flex-col gap-[18px]">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-[20px] border border-slate-100 p-4"
              >
                {/* 카드 헤더: 제목 + 카테고리 배지 */}
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="h-4 w-2/3 rounded bg-slate-200/80" />
                  <div className="h-5 w-16 rounded-full bg-slate-200/50" />
                </div>
                {/* 본문 2줄 */}
                <div className="mb-2 h-3 w-full rounded bg-slate-200/50" />
                <div className="mb-3.5 h-3 w-5/6 rounded bg-slate-200/50" />
                {/* 작성자 줄: 아바타 + 이름/날짜 */}
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-slate-200/70" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-3 w-24 rounded bg-slate-200/70" />
                    <div className="h-2.5 w-16 rounded bg-slate-200/50" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
