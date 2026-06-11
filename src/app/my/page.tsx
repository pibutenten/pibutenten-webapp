import type { Metadata } from "next";
import MyPageClient from "./MyPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false, follow: false },
};

// 마이페이지 — 활성 계정·아바타·멀티ID 전환·역할별 대시보드(관리자/원장)·설정 허브.
//   세션(아바타·identities)은 클라(useSession) 출처라 MyPageClient(클라)가 렌더.
export default function MyPage() {
  return <MyPageClient />;
}
