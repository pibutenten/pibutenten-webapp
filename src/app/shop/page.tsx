import type { Metadata } from "next";

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "쇼핑",
  robots: { index: false, follow: false },
};

export default function ShopPage() {
  return (
    <div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-bold text-[var(--text)]">쇼핑 준비중</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">곧 만나보실 수 있어요.</p>
      </div>
    </div>
  );
}
