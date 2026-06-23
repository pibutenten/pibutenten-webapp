import type { Metadata } from "next";
import Image from "next/image";
import { SITE_URL } from "@/lib/site";
import { APP_STORE_URL, PLAY_STORE_URL } from "./stores";
import AppStoreRedirect from "./AppStoreRedirect";

/**
 * `/app` — 앱 다운로드 랜딩 (공유·QR 단일 진입점).
 *
 *  목적
 *    - 스토어 원본 URL 공유 시 카드(OG)가 제각각·비브랜드로 노출되는 문제를 해결.
 *    - 이 페이지를 대신 공유하면 → 브랜드 OG(하늘색+tt:, opengraph-image.tsx)가 일관 노출.
 *    - 모바일 방문자는 OS 자동 감지로 알맞은 스토어로 이동(AppStoreRedirect).
 *    - 크롤러(OG 봇)는 JS 미실행 → 리다이렉트 안 됨 → 카드만 수집(설계 의도).
 *
 *  색인 정책
 *    - robots index:false — 스토어로 보내는 얇은(thin) 경유 페이지이므로 검색 노출 제외.
 *    - 단, noindex 는 소셜 OG 스크래핑과 무관 → 공유 카드는 정상 동작.
 */

const TITLE = "피부텐텐 앱 다운로드";
const DESCRIPTION =
  "피부텐텐 앱을 App Store·Play 스토어에서 다운로드하세요. 모바일에서 열면 사용 기기에 맞는 스토어로 자동 이동합니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/app` },
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/app`,
    type: "website",
    siteName: "피부텐텐",
    locale: "ko_KR",
    // ⚠ images 를 명시하지 않는다 — opengraph-image.tsx 파일 컨벤션이
    //   이 라우트의 og:image / twitter:image 를 자동 연결한다.
    //   여기서 images 를 주면 그 자동 연결을 덮어써 커스텀 하늘색 카드가 사라진다.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const BRAND_BLUE = "#4cbff2";

export default function AppDownloadPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "48px 24px",
        background: BRAND_BLUE,
        textAlign: "center",
      }}
    >
      {/* 앱 아이콘 느낌의 흰 카드 안에 브랜드 로고 — 배경 하늘색과 분리 */}
      <div
        style={{
          width: 132,
          height: 132,
          borderRadius: 30,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
        }}
      >
        <Image
          src="/brand-logo.svg"
          alt="피부텐텐"
          width={96}
          height={96}
          priority
          style={{ width: 96, height: "auto" }}
        />
      </div>

      <h1
        style={{
          margin: 0,
          color: "#fff",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        피부텐텐 앱 다운로드
      </h1>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <a
          href={APP_STORE_URL}
          style={{
            display: "block",
            padding: "14px 20px",
            borderRadius: 14,
            background: "#fff",
            color: BRAND_BLUE,
            fontSize: 16,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          App Store (iPhone·iPad)
        </a>
        <a
          href={PLAY_STORE_URL}
          style={{
            display: "block",
            padding: "14px 20px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.18)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            textDecoration: "none",
            border: "1.5px solid rgba(255,255,255,0.7)",
          }}
        >
          Play 스토어 (Android)
        </a>
      </div>

      {/* 데스크톱 등 미감지 환경에서만 안내 문구 노출, 모바일은 자동 이동 */}
      <AppStoreRedirect />
    </main>
  );
}
