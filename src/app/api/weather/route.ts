import { NextResponse } from "next/server";

/**
 * /api/weather — Open-Meteo(대기질 + 예보) 서버 프록시 + 공유 캐시.
 *
 * 왜: 기존엔 브라우저가 매 방문마다 Open-Meteo 두 곳을 직접·무캐시로 호출했다(콜드로드 시
 *   7일 hourly 페이로드 cross-origin 왕복 = "날씨 박스 늦게 뜸"의 주원인). 서버 프록시로 바꿔
 *   좌표별 10분 공유 캐시(엣지 s-maxage)를 적용하면, 같은 좌표(특히 기본값 대치동)는 첫 1회 외엔
 *   거의 즉시 응답한다. 날씨는 천천히 바뀌므로 10분 캐시가 정확도에 안전하다.
 *
 * 캐시 카디널리티: 좌표를 소수 2자리(≈1km)로 반올림해 묶는다(useWeather coordKey 와 동일 입도).
 *
 * 시간대: 현재 시각 의존 가공(computeSnapshot 의 nowIndex·day0)은 사용자 로컬 시각이 필요하므로
 *   서버에서 계산하지 않는다. 이 라우트는 Open-Meteo 원본 JSON(aq·wx)만 반환하고, 가공은
 *   클라이언트(weather-logic.fetchWeather)가 수행한다 — 서버는 UTC라 "지금" 값이 틀어진다.
 */
export const runtime = "nodejs";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: true, reason: "lat/lon required" }, { status: 400 });
  }
  const la = round2(lat);
  const lo = round2(lon);

  const aqUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}` +
    `&current=uv_index,uv_index_clear_sky,pm2_5,pm10&hourly=uv_index,uv_index_clear_sky,pm2_5,pm10&past_days=1&forecast_days=7&timezone=auto`;
  const wxUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,shortwave_radiation,is_day` +
    `&hourly=cloud_cover,shortwave_radiation,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,apparent_temperature_max,precipitation_sum&past_days=1&forecast_days=7&timezone=auto`;

  try {
    // 업스트림 데이터 캐시(좌표 URL 키, 10분) — 동시·반복 호출이 Open-Meteo 를 한 번만 친다.
    const [aqRes, wxRes] = await Promise.all([
      fetch(aqUrl, { next: { revalidate: 600 } }),
      fetch(wxUrl, { next: { revalidate: 600 } }),
    ]);
    const [aq, wx] = await Promise.all([aqRes.json(), wxRes.json()]);
    if (aq?.error || wx?.error) {
      return NextResponse.json(
        { error: true, reason: aq?.reason || wx?.reason || "open-meteo error" },
        { status: 502 },
      );
    }
    // 엣지/CDN 공유 캐시 — 같은 좌표는 10분간 캐시 응답, 이후 1시간은 stale 허용하며 백그라운드 갱신.
    return NextResponse.json(
      { aq, wx },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ error: true, reason: "fetch failed" }, { status: 502 });
  }
}
