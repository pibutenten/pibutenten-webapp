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
    default: "피부텐텐 | 피부과 전문의가 답하는 리프팅·스킨부스터 Q&A 라운지",
    template: "피부텐텐 | %s",
  },
  description:
    "피부과 전문의가 답하는 리프팅·스킨부스터·안티에이징·피부시술 Q&A와 칼럼. 광고 없이 검증된 답변만 모았습니다.",
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
      .select(
        "role, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;
    // doctor_accounts 매핑 lookup (헤더 1-click 진입용).
    // role과 무관하게 항상 조회 — 배정민처럼 role='admin'이면서 doctor 매핑이 있는
    // 케이스에서 primary identity를 '원장'으로 정확히 렌더하기 위함.
    let doctorSlug: string | null = null;
    {
      const { data: da } = await supabase
        .from("doctor_accounts")
        .select("doctor:doctors(slug)")
        .eq("profile_id", user.id)
        .maybeSingle();
      const d = da?.doctor as { slug: string } | { slug: string }[] | null;
      doctorSlug = Array.isArray(d) ? d[0]?.slug ?? null : d?.slug ?? null;
    }
    // 페르소나 — 의사/관리자가 personal로 스위치한 상태 여부
    const { readPersonaServer } = await import("@/lib/persona-server");
    const persona = (await readPersonaServer()) as "official" | "personal";

    // v4 multi-identity — primary + profile_identities 모두 가져와 dropdown 구성
    const { data: extraIdentities } = await supabase
      .from("profile_identities")
      .select("id, handle, display_name, avatar_url, kind")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true });
    const identities: import("@/components/TopNav").SessionIdentity[] = [];
    if (profile.handle) {
      identities.push({
        id: "primary",
        handle: profile.handle as string,
        displayName: (profile.display_name as string | null) ?? user.email ?? "",
        avatarUrl: (profile.avatar_url as string | null) ?? null,
        // primary identity kind: doctor 매핑 > admin > user (회원)
        kind: doctorSlug
          ? "doctor"
          : profile.role === "admin"
            ? "admin"
            : profile.role === "doctor"
              ? "doctor"
              : "user",
      });
    }
    for (const ei of (extraIdentities ?? []) as Array<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      kind: string;
    }>) {
      // primary identity (profiles.handle 자체)와 동일 handle인 profile_identities row는
      // dropdown 중복 방지. kind 무관 — 0041 migration 이후 doctor/admin 등으로 바뀐 케이스도 포함.
      // (DB row는 qa_likes/qa_saves FK 때문에 그대로 유지)
      if (ei.handle === profile.handle) continue;
      identities.push({
        id: ei.id,
        handle: ei.handle,
        displayName: ei.display_name,
        avatarUrl: ei.avatar_url,
        kind: ei.kind,
      });
    }
    // v5.1: dropdown 순서 — 관리자 / 원장 / 개인 / 기타 (사용자 의도)
    const KIND_ORDER: Record<string, number> = {
      admin: 0,
      doctor: 1,
      primary: 1, // primary가 doctor면 1, 그 외엔 fallback
      user: 2,
      other: 3,
    };
    identities.sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99),
    );
    // 활성 identity 결정 — cookie 우선, 없으면 'primary'
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const activeFromCookie = cookieStore.get("pibutenten:identity")?.value;
    const activeIdentityId =
      activeFromCookie && identities.some((i) => i.id === activeFromCookie)
        ? activeFromCookie
        : "primary";

    return {
      role: (profile.role as "admin" | "doctor" | "user") ?? "user",
      displayName: profile.display_name ?? user.email ?? "",
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      altDisplayName: (profile.alt_display_name as string | null) ?? null,
      altAvatarUrl: (profile.alt_avatar_url as string | null) ?? null,
      handle: (profile.handle as string | null) ?? null,
      altHandle: (profile.alt_handle as string | null) ?? null,
      doctorSlug,
      persona,
      identities,
      activeIdentityId,
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
