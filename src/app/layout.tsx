import type { Metadata, Viewport } from "next";
import Script from "next/script";
import TopNav, { type SessionInfo } from "@/components/TopNav";
import ScrollManager from "@/components/ScrollManager";
import FloatingWriteButton from "@/components/FloatingWriteButton";
import InstallPrompt from "@/components/InstallPrompt";
import SiteFooter from "@/components/SiteFooter";
import EngagementPromptListener from "@/components/EngagementPromptListener";
import { SessionProvider } from "@/lib/session-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import { IDENTITY_COOKIE, UUID_RE } from "@/lib/identity-shared";
import { allClinicsSchema } from "@/lib/schema/clinic";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import "./globals.css";

// Pretendard variable font — self-host via @font-face in globals.css.
// Next.js 16 turbopack + next/font/local의 'target.css' resolve 이슈로 인해
// next/font 우회. globals.css의 @font-face로 직접 등록 + preload는 <link> 태그.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "피부텐텐 | 피부가 예뻐지는 모든 이야기",
    template: "피부텐텐 | %s",
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
};

export const viewport: Viewport = {
  // 2026-05-20 — PWA 상태바(최상단 OS 정보창)를 흰색으로 통일.
  // 안드로이드 PWA splash 배경은 manifest.background_color (#4CBFF2)가, 상태바 색은
  // theme_color (#FFFFFF) 가 담당. iOS PWA 는 statusBarStyle="default" 로 흰 배경+검정 텍스트.
  themeColor: "#FFFFFF",
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

    // Phase 9 묶음 lookup — bundleProfileFilter 와 동일 패턴.
    //   2026-05-16 회귀 fix: 기존 .eq("auth_user_id", user.id) 는 일부 환경에서
    //   1 row 만 반환되어 IdentitySwitcher dropdown 사라지는 회귀 발생 → .or() OR 패턴으로 통일.
    //   2026-05-27 회귀 fix: getSessionInfo 가 base profile (id = user.id) 만 읽어서
    //   active 가 admin/user 라도 SessionInfo.role 이 base 의 role 로 박혀 메뉴 표시 회귀.
    //   → 묶음 전체를 먼저 fetch 한 뒤, cookie 기반으로 active 결정하고 그 row 에서 role/avatar
    //   /handle/displayName 을 빌드. ADR 0001 (active 단위 동등 독립 권한) 정합.
    const { data: groupRows } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, role")
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .order("created_at", { ascending: true });
    const rows = (groupRows ?? []) as Array<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      role: string;
    }>;
    if (rows.length === 0) return null;

    // 의사 매핑 (각 profile.id가 어느 doctor의 가입자인지). SSOT: profiles.doctor_id.
    const groupIds = rows.map((r) => r.id);
    const docMap = new Map<string, string>(); // profile_id → doctor.slug
    {
      const metaMap = await getDoctorMetaBatch(supabase, groupIds);
      for (const [pid, meta] of metaMap) {
        if (meta.slug) docMap.set(pid, meta.slug);
      }
    }

    const identities: import("@/components/TopNav").SessionIdentity[] = rows.map(
      (r) => {
        // doctor 매핑된 row는 doctors.photo_url 우선 (single source)
        const docSlug = docMap.get(r.id);
        const avatar = docSlug ? `/doctors/${docSlug}.png` : r.avatar_url;
        return {
          // Critical-5 (2026-05-27): 항상 실제 profile.id (UUID).
          // 본 계정도 자체 profile.id (= user.id) 그대로 운반. sentinel "primary" 폐지.
          id: r.id,
          handle: r.handle ?? "",
          displayName: r.display_name ?? user.email ?? "",
          avatarUrl: avatar,
          kind: r.role, // role을 kind alias로 사용
        };
      },
    );

    // dropdown 정렬 — 역할 우선도 (UI 표시 순서만, 권한 부여와 무관).
    // ADR 0001 동등 독립 원칙: 정렬은 표시 순서일 뿐, 위계 의미 없음.
    const KIND_ORDER: Record<string, number> = {
      admin: 0,
      doctor: 1,
      user: 2,
    };
    identities.sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99),
    );

    // 활성 identity 결정 — cookie 가 UUID 이고 묶음 내 identity 면 사용, 그 외 base profile.id (= user.id).
    // Critical-5 (2026-05-27): 옛 sentinel "primary" 비교 폐지. 항상 UUID.
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const activeFromCookie = cookieStore.get(IDENTITY_COOKIE)?.value;
    const activeIdentityId =
      activeFromCookie &&
      UUID_RE.test(activeFromCookie) &&
      rows.some((r) => r.id === activeFromCookie)
        ? activeFromCookie
        : user.id;

    // ADR 0001 active 단위 정합 (2026-05-27): role/avatar/handle/displayName/doctorSlug
    // 모두 ACTIVE profile 기준으로 결정. 옛: base profile (user.id) 기준이라 admin active
    // 인데 base 가 doctor 인 케이스에서 me.role='doctor' 박혀 모든 카드 메뉴 가림 회귀.
    const activeRow = rows.find((r) => r.id === activeIdentityId) ?? rows[0];
    const activeDoctorSlug = docMap.get(activeRow.id) ?? null;

    return {
      role: (activeRow.role as "admin" | "doctor" | "user") ?? "user",
      displayName: activeRow.display_name ?? user.email ?? "",
      avatarUrl: activeRow.avatar_url ?? null,
      handle: activeRow.handle ?? null,
      doctorSlug: activeDoctorSlug,
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
            __html: jsonLdString({
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
                    "피부과 전문의가 함께 만드는 피부 미용 커뮤니티",
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
                    // /search 는 page-level noindex(follow=true) 이므로 크롤이 결과 페이지를 따라가서 개별 카드로 진입.
                    target: `${SITE_URL}/search?q={search_term_string}`,
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
        {/* SessionProvider — SSR 에서 결정된 session 정보를 클라이언트 컴포넌트에 즉시 전달.
            useCardViewer 의 me 결정 시 비동기 auth.getUser() 기다리지 않고 즉시 로그인 여부 판단 가능.
            (비로그인 사용자가 좋아요 클릭 즉시 LoginPromptDialog 트리거 보장 — 2026-05-20 회귀 fix) */}
        <SessionProvider session={session}>
          <ScrollManager />
          <TopNav session={session} />
          <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 pt-2 pb-8 sm:px-6">
            {children}
          </main>
          <SiteFooter />
          <FloatingWriteButton hasSession={!!session?.role} />
          {/* PWA 설치 안내 — Q&A 5개 본 사용자 또는 로그인 사용자에게 노출 */}
          <InstallPrompt signedIn={!!session?.role} />
          {/* 비로그인 흥미 점수 임계점 도달 시 회원가입 권유 모달 (2026-05-21) */}
          <EngagementPromptListener />
        </SessionProvider>
      </body>
    </html>
  );
}
