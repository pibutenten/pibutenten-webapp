"use client";

/**
 * 전역 에러 바운더리 (root layout 자체가 깨졌을 때의 최종 폴백).
 *
 * global-error.tsx 는 root layout 을 "대체"하므로:
 *   1) html/body 를 직접 렌더해야 한다(layout 이 제공하던 골격이 없음).
 *   2) globals.css / beta-skin 토큰이 로드되지 않는다 → CSS 변수·Tailwind·pbttSpin
 *      키프레임 모두 사용 불가. loading.tsx 와 동일하게 토큰 값을 인라인으로 복제한다.
 *
 * 거의 발생하지 않는 최후의 화면이므로 과한 디자인 없이 미니멀 복구 UI 만 둔다.
 * (일반 라우트 예외는 error.tsx 가 먼저 잡으므로 베타 톤이 그대로 유지됨.)
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          // 베타 캔버스와 동일한 그라데이션(loading.tsx / beta-skin --tt-canvas 복제)
          background:
            "linear-gradient(168deg, #e8f5fd 0%, #ecf7f2 52%, #faf5e2 100%)",
          fontFamily:
            "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "#383F47", // --text
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            boxSizing: "border-box",
            backgroundColor: "#ffffff",
            border: "1px solid #E5E3DD", // --border
            borderRadius: 12, // --radius
            boxShadow: "0 1px 3px rgba(27, 73, 101, 0.06)", // --shadow-sm
            padding: 32,
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: 18,
              fontWeight: 700,
              color: "#383F47", // --text
            }}
          >
            일시적인 오류가 발생했어요
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 14,
              lineHeight: 1.6,
              color: "#595E60", // --text-secondary
            }}
          >
            잠시 후 다시 시도해 주세요.
            <br />
            문제가 계속되면 홈으로 돌아가 주세요.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                appearance: "none",
                cursor: "pointer",
                borderRadius: 6,
                border: "none",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#ffffff",
                backgroundColor: "#4CBFF2", // --primary
              }}
            >
              다시 시도
            </button>
            <a
              href="/"
              style={{
                display: "block",
                textDecoration: "none",
                borderRadius: 6,
                border: "1px solid #E5E3DD", // --border
                padding: "10px 16px",
                fontSize: 14,
                color: "#595E60", // --text-secondary
                backgroundColor: "#ffffff",
              }}
            >
              홈으로 가기
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
