import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "피부텐텐";

/**
 * Open Graph 이미지 — 1200x630 하늘색 배경 가운데에 logo.svg 그대로.
 * "피부텐텐 Q&A" 텍스트 없이 로고(라운드 사각형 + tt:)만.
 * 빌드 시 PNG로 자동 변환되어 /opengraph-image 로 노출.
 */
export default async function OGImage() {
  const logoSvg = await readFile(
    join(process.cwd(), "public/logo.svg"),
    "utf-8",
  );
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} width={500} height={500} alt="피부텐텐 logo" />
      </div>
    ),
    size,
  );
}
