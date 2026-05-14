import type { Metadata } from "next";

export const metadata: Metadata = {
  // 루트 layout의 title.template "피부텐텐 | %s" 이 "피부텐텐 | 로그인"으로 렌더링
  title: "로그인",
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
