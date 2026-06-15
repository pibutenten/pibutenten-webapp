import type { Metadata } from "next";
import ShopView from "@/app/beta-skin/shop/ShopView";

// ShopView(BetaSkinShell) 가 클라이언트 훅(useSearchParams 등) 사용 → 동적 렌더.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "쇼핑",
  robots: { index: false, follow: false },
};

export default function ShopPage() {
  return <ShopView />;
}
