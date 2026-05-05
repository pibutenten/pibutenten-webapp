import { ImageResponse } from "next/og";

// 카카오톡·트위터·페북 표준
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

/**
 * Open Graph 이미지 — 1200x630 하늘색 배경 + 흰색 tt: 가운데
 * (logo.svg의 시각 형태를 1200x630 캔버스에 재현)
 */
export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#7DC1DD",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: 380,
            letterSpacing: "-16px",
            paddingBottom: 30,
          }}
        >
          tt:
        </div>
      </div>
    ),
    size,
  );
}
