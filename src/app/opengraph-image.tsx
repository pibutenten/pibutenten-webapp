import { ImageResponse } from "next/og";

// 카카오톡·트위터·페북 표준
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

/**
 * Open Graph 이미지 — 하늘색 가득 + 흰색 tt:
 * 모든 페이지의 카드 미리보기에 동일하게 사용됨.
 * 빌드 시 PNG로 자동 변환되어 /opengraph-image.png 로 노출.
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
          color: "#FFFFFF",
          fontSize: 420,
          fontWeight: 700,
          letterSpacing: "-16px",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        tt:
      </div>
    ),
    size,
  );
}
