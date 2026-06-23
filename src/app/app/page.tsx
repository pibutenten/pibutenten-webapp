import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { APP_STORE_URL, PLAY_STORE_URL } from "./stores";
import AppStoreRedirect from "./AppStoreRedirect";

/**
 * `/app` — 앱 다운로드 랜딩 (공유·QR 단일 진입점).
 *
 *  목적
 *    - 스토어 원본 URL 공유 시 카드(OG)가 제각각·비브랜드로 노출되는 문제를 해결.
 *    - 이 페이지를 대신 공유하면 → 브랜드 OG(하늘색+tt:, opengraph-image.png)가 일관 노출.
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
    // ⚠ images 를 명시하지 않는다 — opengraph-image.png 파일 컨벤션이
    //   이 라우트의 og:image / twitter:image 를 자동 연결한다.
    //   여기서 images 를 주면 그 자동 연결을 덮어써 스토어 그래픽 카드가 사라진다.
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
        // ⚠ 루트 layout.tsx 의 <main mx-auto max-w-[1080px] px-4 …> 패딩/최대폭
        //   컨테이너 안에 들어가면 하늘색 박스 바깥으로 흰 테두리가 보인다.
        //   앱 셸 관례(z-100 풀스크린 오버레이)대로 fixed inset:0 으로 그 컨테이너를
        //   탈출해 화면 전체를 하늘색으로 채운다.
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflowY: "auto",
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
      {/* tt: 피부텐텐 한 줄 록업 — brand-logo.svg 원본 좌표(viewBox 0 0 539.77 147.18)를
          그대로 써서 디자인된 간격을 유지하되, 하늘색 배경에 맞춰 원은 흰색 · tt: 글리프는
          하늘색(BRAND_BLUE) · 피부텐텐 워드마크는 흰색으로 반전(스토어 OG 카드와 동일 록업). */}
      <svg
        width={272}
        height={74}
        viewBox="0 0 539.77 147.18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="피부텐텐"
        style={{ width: "min(72vw, 300px)", height: "auto" }}
      >
        {/* 피부텐텐 워드마크 (흰색) */}
        <polygon
          fill="#fff"
          points="263.83 81.28 303.72 81.28 303.72 122.74 314.55 122.74 314.55 81.28 354.44 81.28 354.44 77.25 263.83 77.25 263.83 81.28"
        />
        <path
          fill="#fff"
          d="M339.38,25.37h-11.37v16.73h-37.86v-16.73h-11.18v41.71h60.41V25.37ZM328.02,63.49h-37.86v-17.15h37.86v17.15Z"
        />
        <rect fill="#fff" x="242.99" y="24.73" width="10.84" height="98" />
        <path
          fill="#fff"
          d="M222.91,89.68v-47.9h11.68v-5.61h-61.28v5.61h11.68v50.09c-4.04-.02-8.26-.07-12.8-.1v5.61c11.44-.12,41.06.49,64.94-6.91.08-.03-.86-3.2-.86-3.2-4.79,1-9.2,1.79-13.35,2.41ZM211.23,41.78v49.29c-5.01.44-9.77.65-14.58.75v-50.04h14.58Z"
        />
        <rect fill="#fff" x="433.16" y="24.07" width="10.46" height="69.12" />
        <path
          fill="#fff"
          d="M409.61,73.37c-8.42,2.56-23.48,4.23-34.11,4.35v-21.04h22.61v-4.23h-22.61v-18.37h28.68v-3.6h-39.52v52.57c11.95.09,33.78-2.13,45.85-6.5l-.91-3.19Z"
        />
        <polygon
          fill="#fff"
          points="403.45 58.63 415.86 58.63 415.86 93.18 426.32 93.18 426.32 24.07 415.86 24.07 415.86 55.14 403.45 55.14 403.45 58.63"
        />
        <path
          fill="#fff"
          d="M394.62,117.15v-25.6l-10.84-1.5v32.68c40.8,1.69,53.47-1.76,63.02-4.11v-3.47c-20.09,4.1-45.33,2.53-52.18,1.99Z"
        />
        <rect fill="#fff" x="526.13" y="24.07" width="10.46" height="69.12" />
        <path
          fill="#fff"
          d="M502.57,73.37c-8.42,2.56-17.22,3.48-25.98,4.17l-8.13.19v-21.04h22.61v-4.23h-22.61v-18.37h28.68v-3.6h-39.52v52.57c11.95.09,33.78-2.13,45.85-6.5l-.91-3.19Z"
        />
        <polygon
          fill="#fff"
          points="496.41 58.63 508.82 58.63 508.82 93.18 519.29 93.18 519.29 24.07 508.82 24.07 508.82 55.14 496.41 55.14 496.41 58.63"
        />
        <path
          fill="#fff"
          d="M487.58,117.15v-25.6l-10.84-1.5v32.68c40.8,1.69,53.47-1.76,63.02-4.11v-3.47c-20.09,4.1-45.33,2.53-52.18,1.99Z"
        />
        {/* tt: 심볼 — 흰 원 + 하늘색 tt: */}
        <circle fill="#fff" cx="73.59" cy="73.59" r="73.59" />
        <path
          fill={BRAND_BLUE}
          d="M106.77,60.05c0-3.63,3.11-6.75,7.06-6.75s6.95,3.11,6.95,6.75-3.11,7.06-6.95,7.06-7.06-3.22-7.06-7.06ZM106.77,90.99c0-3.63,3.11-6.75,7.06-6.75s6.95,3.11,6.95,6.75-3.11,6.85-6.95,6.85-7.06-3.22-7.06-6.85Z"
        />
        <path
          fill={BRAND_BLUE}
          d="M57.71,97.51c-5.74,0-8.16-2.87-8.05-9.04l.55-27.89h9.71v-5.36l-9.61-.05.11-11.46-.45-.11-23.59,17.42h11.79l-.55,28.88c-.1,9.37,4.08,13.67,12.9,13.67,6.5,0,11.79-3.97,16.76-9.04l-.45-.44c-2.09,1.87-4.84,3.41-9.14,3.41Z"
        />
        <path
          fill={BRAND_BLUE}
          d="M99.71,94.09c-2.09,1.87-4.85,3.42-9.15,3.42-5.73,0-8.16-2.87-8.05-9.04l.55-27.89h14.77v-5.3l-14.66-.1.11-11.46-.44-.11-18.52,13.67v3.31h6.71v.44h.01l-.55,28.88c-.11,9.37,4.08,13.67,12.9,13.67,6.5,0,11.8-3.97,16.76-9.04l-.44-.44Z"
        />
      </svg>

      <h1
        style={{
          margin: 0,
          color: "#fff",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        앱 다운로드
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
