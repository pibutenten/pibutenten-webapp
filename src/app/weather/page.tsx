import type { Metadata } from "next";
import WeatherDetailView from "@/components/skin/record/skin-weather/WeatherDetailView";

/**
 * /record/weather — "오늘의 피부 날씨" 상세(비공개·noindex).
 *   내 노트 상단 날씨 카드 → "자세히" 클릭 시 진입. 데이터는 클라(useWeather) 측위·fetch라
 *   동적 렌더. 위치 기반·인증 불필요(게스트·회원 공통).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오늘의 피부 날씨",
  robots: { index: false, follow: false },
};

export default function WeatherPage() {
  return <WeatherDetailView />;
}
