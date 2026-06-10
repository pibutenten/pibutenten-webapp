import type { Metadata } from "next";
import RecordTab from "./RecordTab";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술기록 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default function BetaRecordPage() {
  return <RecordTab />;
}
