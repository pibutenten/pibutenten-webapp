import type { Metadata } from "next";
import RecordTab from "./RecordTab";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 일기",
  robots: { index: false, follow: false },
};

export default function RecordPage() {
  return <RecordTab />;
}
