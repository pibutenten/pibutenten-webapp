import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Script from "next/script";
import TopNav, { type SessionInfo } from "@/components/TopNav";
import ScrollManager from "@/components/ScrollManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pibutenten-webapp.vercel.app"),
  title: {
    default: "피부텐텐",
    template: "%s | 피부텐텐",
  },
  description:
    "피부과 전문의가 함께하는 피부 미용 SNS. 피드, 검색, 원장님 소개를 한 곳에서.",
  applicationName: "피부텐텐",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
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
      .select("role, display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;
    return {
      role: profile.role ?? "user",
      displayName: profile.display_name ?? user.email ?? "",
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
    <html lang="ko" className={`${notoSansKR.variable} h-full antialiased`}>
      <head>
        {/* F5/리로드 시 브라우저 스크롤 자동복원 끄기 — 페이지 페인트 전에 실행 */}
        <Script id="scroll-restoration" strategy="beforeInteractive">
          {`if ('scrollRestoration' in history) history.scrollRestoration = 'manual';`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <ScrollManager />
        <TopNav session={session} />
        <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-4 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
