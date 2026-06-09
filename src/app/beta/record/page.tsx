import type { Metadata } from "next";
import RecordTab from "./RecordTab";

export const metadata: Metadata = {
  title: "시술기록 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default function BetaRecordPage() {
  return <RecordTab />;
}
