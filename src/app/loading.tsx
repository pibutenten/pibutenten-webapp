/**
 * 전역 Suspense 로딩 폴백.
 *
 * force-dynamic 페이지의 SSR 동안 잠깐 노출되는 화면이라, 베타 셸(beta-skin
 * `.root`: position:fixed/inset:0 풀뷰포트 오버레이)이 마운트되기 전 "회색 깜빡임"
 * 없이 자연스럽게 이어지도록 한다.
 *
 * - 회색 스켈레톤 박스 다수를 제거하고, 베타 캔버스(하늘→민트→레몬 그라데이션)와
 *   동일한 배경으로 시작 → 베타 셸 등장 시 톤 단절 없음.
 * - 상단에 베타 헤더(#e8f5fd) 톤의 얇은 막대 하나만 두어 셸 헤더 자리와 연결.
 * - 은은한 브랜드 블루(#45b7e8) 스피너로 "비어 보이지 않게" 하되 절제.
 *
 * beta-skin.module.css 는 수정 금지 대상이라 토큰 값을 인라인으로 복제(참고).
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="불러오는 중"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90, // 베타 셸(.root z-index:100)이 뜨면 그 아래로 가려짐
        display: "flex",
        flexDirection: "column",
        // 베타 캔버스와 동일한 그라데이션으로 시작 → 회색 깜빡임 차단
        background:
          "linear-gradient(168deg, #e8f5fd 0%, #ecf7f2 52%, #faf5e2 100%)",
      }}
    >
      {/* 베타 헤더(#e8f5fd) 톤의 얇은 상단 막대 — 셸 헤더 자리와 시각적으로 연결 */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          backgroundColor: "#e8f5fd",
          borderBottom: "1px solid #edf2f5",
        }}
      />

      {/* 은은한 브랜드 스피너 — 절제된 단일 요소 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "3px solid rgba(69, 183, 232, 0.22)",
            borderTopColor: "#45b7e8",
            animation: "pbttSpin 0.8s linear infinite",
          }}
        />
      </div>
    </div>
  );
}
