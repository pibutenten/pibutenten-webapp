import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "쇼핑 — 피부텐텐 베타",
  robots: { index: false, follow: false },
};

export default function BetaShopPage() {
  return (
    <div className="pb-16 sm:pb-0">
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-bold text-[var(--text)]">쇼핑 준비중</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">곧 만나보실 수 있어요.</p>
      </div>
    </div>
  );
}
