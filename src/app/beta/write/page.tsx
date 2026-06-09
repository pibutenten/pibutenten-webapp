import type { Metadata } from "next";
import WriteTabs from "./WriteTabs";

export const metadata: Metadata = {
  title: "글쓰기 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default function BetaWritePage() {
  return <WriteTabs />;
}
