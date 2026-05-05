import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Script from "next/script";
import TopNav from "@/components/TopNav";
import ScrollManager from "@/components/ScrollManager";
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
    // /opengraph-image 라우트(자동 생성, Q&A 글씨 없는 logo 가운데 + 하늘색)
  },
  twitter: {
    card: "summary_large_image",
    title: "피부텐텐",
    description: "피부가 예뻐지는 모든 이야기",
  },
};

export const viewport: Viewport = {
  themeColor: "#1B4965",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
        <TopNav />
        <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-4">
          {children}
        </main>
      </body>
    </html>
  );
}
