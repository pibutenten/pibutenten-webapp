import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ChromeHeader, ChromeFooter } from "@/components/GlobalChrome";
import ScrollManager from "@/components/ScrollManager";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import EngagementPromptListener from "@/components/EngagementPromptListener";
import NativeAuthDeepLink from "@/components/NativeAuthDeepLink";
import WriteFab from "@/components/WriteFab";
import { SessionProvider } from "@/lib/session-context";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { groupOnlySchema } from "@/lib/schema/clinic";
import {
  buildOrganizationSchema,
  buildWebsiteSchema,
} from "@/lib/schema/organization";
import "./globals.css";

const GA4_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim();
const NAVER_ANALYTICS_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID?.trim();

// Pretendard variable font — self-host via @font-face in globals.css.
// Next.js 16 turbopack + next/font/local의 'target.css' resolve 이슈로 인해
// next/font 우회. globals.css의 @font-face로 직접 등록 + preload는 <link> 태그.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "피부텐텐 | 피부가 예뻐지는 모든 이야기",
    // 콘텐츠 페이지는 키워드(주제) first · 브랜드 last (2026-06-05 메타 통일).
    //   홈만 brand-first(default, 템플릿 미적용). reports/홈 등 absolute title 은 영향 없음.
    template: "%s | 피부텐텐",
  },
  description:
    "피부과 전문의가 직접 답하는 리프팅·스킨부스터·안티에이징·피부시술 커뮤니티. 광고 없이 검증된 답변만 모았습니다.",
  applicationName: "피부텐텐",
  manifest: "/manifest.webmanifest",
  icons: {
    // 파비콘(브라우저 탭) — 동그라미 로고. PWA 설치 아이콘은 manifest.icons에서 정사각 별도 사용.
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png?v=2",
  },
  appleWebApp: {
    capable: true,
    title: "피부텐텐",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "피부텐텐",
    title: "피부텐텐 | 피부가 예뻐지는 모든 이야기",
    description:
      "피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "피부텐텐" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "피부텐텐 | 피부가 예뻐지는 모든 이야기",
    description:
      "피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티",
    images: ["/og.png"],
  },
  // 2026-05-28: 검색엔진 사이트 인증 토큰. env 가 비었으면 해당 키를 객체에서 완전 제외해
  //   빈 <meta content=""> 가 렌더되는 것을 차단 (Naver 의 "잘못된 토큰" 오판정 방지).
  //   - Naver Search Advisor: https://searchadvisor.naver.com → 사이트 등록 → 메타태그
  //   - Google Search Console: https://search.google.com/search-console → 속성 추가 → HTML 태그
  //   - Bing Webmaster Tools: https://www.bing.com/webmasters → 사이트 추가 → HTML 메타태그
  verification: buildVerification(),
};

function buildVerification(): Metadata["verification"] {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const naver = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim();
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();
  const other: Record<string, string> = {};
  if (naver) other["naver-site-verification"] = naver;
  if (bing) other["msvalidate.01"] = bing;
  const v: NonNullable<Metadata["verification"]> = {};
  if (google) v.google = google;
  if (Object.keys(other).length > 0) v.other = other;
  return v;
}

export const viewport: Viewport = {
  // 2026-05-20 — PWA 상태바(최상단 OS 정보창)를 흰색으로 통일.
  // 안드로이드 PWA splash 배경은 manifest.background_color (#4CBFF2)가, 상태바 색은
  // theme_color (#FFFFFF) 가 담당. iOS PWA 는 statusBarStyle="default" 로 흰 배경+검정 텍스트.
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// V3(2026-06-07): 전역 force-dynamic 제거 → 공개 콘텐츠(상세·토픽)는 페이지별 revalidate 로 ISR 캐시.
//   layout 은 V1 이후 서버에서 세션/쿠키를 안 읽으므로 캐시 안전. 개인 표시는 전부 클라(SessionProvider/
//   useSession/useCardViewer). 개인·동적 페이지는 각자 export const dynamic="force-dynamic" 로 동적 유지.

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // V-Phase(2026-06-07): layout 은 더 이상 서버에서 세션/쿠키를 읽지 않음.
  //   세션은 클라 SessionProvider 가 쿠키(동기)+/api/session(리치)로 결정 → layout 캐시 가능 토대.
  return (
    <html
      lang="ko"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* Pretendard Regular (400) — preload (self-host, FOUT 최소화) */}
        <link
          rel="preload"
          href="/fonts/Pretendard-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* F5/리로드 시 브라우저 스크롤 자동복원 끄기 — 페이지 페인트 전에 실행 */}
        <Script id="scroll-restoration" strategy="beforeInteractive">
          {`if ('scrollRestoration' in history) history.scrollRestoration = 'manual';`}
        </Script>
        {/* PWA splash:
            - 안드로이드: OS native splash 가 manifest.background_color (#4CBFF2) + icon-512 로 자동 표시.
            - iOS: manifest.background_color 무시. apple-touch-startup-image 메타 없으면 흰 화면.
              → 단일 splash 이미지(#4CBFF2 배경에 로고 합성) 등록. 디바이스별 media query 분기 X —
              단일 이미지로도 iOS 가 알아서 스케일. 안드로이드는 이 메타 무시하므로 중복 splash 없음.
            별도 body::before overlay 는 옛 이중 노출 이슈로 폐기 (2026-05-17). */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash.png" />
        {/* 네이티브 앱 출시 후 PWA 설치 유도를 중단(2026-06-24). beforeinstallprompt 를
            preventDefault 해 Chrome 의 기본 PWA 설치 배너만 억제한다(우리 커스텀 설치 안내는 제거됨).
            PWA 자체(서비스워커·오프라인·웹푸시)는 유지 — ServiceWorkerRegister 가 등록 담당. */}
        <Script id="pwa-bip-suppress" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); });`}
        </Script>
        {/* JSON-LD: Organization + WebSite (전역 — AEO/GEO 신뢰 신호 + Sitelinks 검색박스) */}
        <Script
          id="ld-org-website"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: jsonLdString({
              "@context": "https://schema.org",
              "@graph": [
                // 발행사·사이트 식별 노드 — SSOT(lib/schema/organization). 전 페이지 동일 값으로
                //   주입되어 답변·리포트의 publisher @id 참조가 같은 문서에서 해석됨(@id 충돌 0).
                buildOrganizationSchema(),
                buildWebsiteSchema(),
                // 그룹법인 MedicalOrganization 만 전역 노출.
                // 5개 지점 MedicalClinic 은 그룹 전체를 다루는 페이지(/, /about, /contact) 와
                // 해당 의사가 속한 1개 지점만 의사 페이지에서 개별 inject
                // (모든 페이지에 5개 지점 박는 응답 용량 + entity 신호 분산 해소).
                groupOnlySchema(),
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* SessionProvider — 클라에서 세션 결정: 마운트 즉시 쿠키(비-httpOnly, UI전용)로 로그인 여부+active id
            동기 판단(네트워크 없음) → 비로그인=null 즉시 → 좋아요 클릭 시 LoginPromptDialog 즉시(2026-05-20 회귀 유지).
            role/avatar/identities 등 리치는 /api/session 으로 비동기 보강. (V-Phase 2026-06-07) */}
        <SessionProvider>
          <ScrollManager />
          {/* 전역 크롬은 경로별 분기(GlobalChrome): 앱 셸 승격 라우트에선 렌더 안 함(옛 헤더 깜빡임 제거). */}
          <ChromeHeader />
          {/* 하단 pb-20(모바일) — BottomNav 고정 하단 5탭 가림 방지 일괄 처리. 데스크탑(하단탭 없음)은 pb-8. */}
          <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 pt-3 pb-20 sm:px-6 sm:pb-8">
            {children}
          </main>
          <ChromeFooter />
          {/* 모바일 우하단 글쓰기 FAB — 하단탭에서 글쓰기 분리. AppShell(z-100 오버레이) 위로
              떠야 하므로 z-[110]. 경로별 노출 제어는 컴포넌트 내부. */}
          <WriteFab />
          {/* 서비스워커 등록(오프라인·웹푸시 토대). 옛 PWA 설치 안내 모달은 네이티브 앱 출시로 제거(2026-06-24). */}
          <ServiceWorkerRegister />
          {/* 비로그인 흥미 점수 임계점 도달 시 회원가입 권유 모달 (2026-05-21) */}
          <EngagementPromptListener />
          {/* 네이티브 앱 OAuth 딥링크 핸들러 — 시스템 브라우저 로그인 복귀 처리(웹=no-op) */}
          <NativeAuthDeepLink />
        </SessionProvider>

        {/* Vercel Analytics + Speed Insights — CWV field data + page view. env 자동 감지. */}
        <Analytics />
        <SpeedInsights />

        {/* GA4 — NEXT_PUBLIC_GA4_MEASUREMENT_ID 가 있을 때만 로드.
            anonymize_ip + 검색 페이지 query string 측정 제외 (의료 검색어 PII 보호).
            의료 콘텐츠 PII 위험 회피: send_page_view: false → 직접 page_view 발화 시
            page_location 에서 /search query string 을 제거한 sanitized URL 로 전송. */}
        {GA4_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA4_ID}', {
  anonymize_ip: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  send_page_view: false
});
(function(){
  function sanitize(url){
    try{
      var u = new URL(url);
      if (u.pathname === '/search') u.search = '';
      return u.toString();
    } catch(e){ return url; }
  }
  gtag('event', 'page_view', { page_location: sanitize(location.href), page_path: location.pathname });
})();`}
            </Script>
          </>
        )}

        {/* 네이버 Analytics — NEXT_PUBLIC_NAVER_ANALYTICS_ID 있을 때만 로드.
            네이버 wcs(Web Conversion Script) 사양.
            script CDN: wcs.pstatic.net / beacon: wcs.naver.com (CSP 양쪽 화이트리스트). */}
        {NAVER_ANALYTICS_ID && (
          <>
            <Script
              src="https://wcs.pstatic.net/wcslog.js"
              strategy="afterInteractive"
            />
            <Script id="naver-analytics-init" strategy="afterInteractive">
              {`if(!window.wcs_add) window.wcs_add = {};
window.wcs_add["wa"] = "${NAVER_ANALYTICS_ID}";
if (window.wcs) {
  window.wcs_do();
}`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
