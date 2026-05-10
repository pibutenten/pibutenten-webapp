import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Script from "next/script";
import TopNav, { type SessionInfo } from "@/components/TopNav";
import ScrollManager from "@/components/ScrollManager";
import FloatingWriteButton from "@/components/FloatingWriteButton";
import InstallPrompt from "@/components/InstallPrompt";
import AppSplash from "@/components/AppSplash";
import SiteFooter from "@/components/SiteFooter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { allClinicsSchema } from "@/lib/schema/clinic";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "피부텐텐",
    template: "%s | 피부텐텐",
  },
  description:
    "피부과 전문의가 함께하는 피부 미용 SNS. 피드, 검색, 원장님 소개를 한 곳에서.",
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
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "피부텐텐",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "피부텐텐",
    title: "피부텐텐",
    description: "피부가 예뻐지는 모든 이야기",
    locale: "ko_KR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "피부텐텐" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "피부텐텐",
    description: "피부가 예뻐지는 모든 이야기",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1B4965",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// layout이 매 요청마다 session을 새로 읽도록 강제 (캐시 방지)
export const dynamic = "force-dynamic";

async function getSessionInfo(): Promise<SessionInfo> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, display_name, avatar_url, alt_display_name, alt_avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;
    return {
      role: (profile.role as "admin" | "doctor" | "user") ?? "user",
      displayName: profile.display_name ?? user.email ?? "",
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      altDisplayName: (profile.alt_display_name as string | null) ?? null,
      altAvatarUrl: (profile.alt_avatar_url as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionInfo();
  return (
    <html
      lang="ko"
      className={`${notoSansKR.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* F5/리로드 시 브라우저 스크롤 자동복원 끄기 — 페이지 페인트 전에 실행 */}
        <Script id="scroll-restoration" strategy="beforeInteractive">
          {`if ('scrollRestoration' in history) history.scrollRestoration = 'manual';`}
        </Script>
        {/* PWA: beforeinstallprompt + appinstalled 이벤트를 React 마운트보다 먼저 캐치 */}
        <Script id="pwa-bip-capture" strategy="beforeInteractive">
          {`window.__pibutenten_bip = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  window.__pibutenten_bip = e;
  window.dispatchEvent(new CustomEvent('pibutenten:bip-ready'));
});
window.addEventListener('appinstalled', function() {
  try { localStorage.setItem('pwa-installed', '1'); } catch (_) {}
  window.__pibutenten_bip = null;
  window.dispatchEvent(new CustomEvent('pibutenten:installed'));
});`}
        </Script>
        {/* JSON-LD: Organization + WebSite (전역 — AEO/GEO 신뢰 신호 + Sitelinks 검색박스) */}
        <Script
          id="ld-org-website"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: "피부텐텐",
                  alternateName: "Pibutenten",
                  url: `${SITE_URL}/`,
                  logo: `${SITE_URL}/logo.png`,
                  description:
                    "피부과 전문의가 함께 만드는 피부 미용 Q&A SNS",
                  sameAs: ["https://www.youtube.com/@pibutenten"],
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: `${SITE_URL}/`,
                  name: "피부텐텐",
                  inLanguage: "ko-KR",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: `${SITE_URL}/?q={search_term_string}`,
                    "query-input": "required name=search_term_string",
                  },
                },
                // 5개 힐하우스 브랜치 + 그룹 — 9명 의사가 worksFor: @id로 참조함
                ...allClinicsSchema(),
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ScrollManager />
        <TopNav session={session} />
        <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-4 sm:px-6">
          {children}
        </main>
        <SiteFooter />
        <FloatingWriteButton hasSession={!!session?.role} />
        {/* PWA 설치 안내 — Q&A 5개 본 사용자 또는 로그인 사용자에게 노출 */}
        <InstallPrompt signedIn={!!session?.role} />
        {/* 앱 구동 splash overlay — standalone 진입 시 1.5초 동그라미 로고 */}
        <AppSplash />
      </body>
    </html>
  );
}
