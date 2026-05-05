import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import TopNav from "@/components/TopNav";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "피부텐텐 — 피부가 예뻐지는 모든 이야기",
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
      <body className="min-h-full flex flex-col">
        <TopNav />
        <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-4">
          {children}
        </main>
      </body>
    </html>
  );
}
