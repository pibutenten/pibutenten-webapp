import { NextResponse } from "next/server";

/**
 * /api/iploc — 접속 IP 기반 대략 위치(도시/동 수준) 폴백 endpoint.
 *
 * 기기 GPS 측위가 불가/거부일 때, 하드코딩 대치동 대신 "대략 위치라도" 보여주기 위한 폴백.
 * Vercel 이 요청에 자동으로 붙여주는 IP 지오 헤더(`x-vercel-ip-*`)만 읽는다.
 *
 * ADR 0021 무관: Vercel 헤더만 읽음, 외부호출 없음.
 *   - 본 라우트는 어떤 서드파티 API 도 호출하지 않는다(Open-Meteo 등 외부 fetch 0건).
 *   - 따라서 "무료 per-IP 제한 API 를 공유 서버리스 egress IP 로 프록시"하는 ADR 0021 의
 *     안티패턴(공유 IP 합산 한도 → 전원 대치동 사고)에 해당하지 않는다. 헤더는 Vercel 엣지가
 *     요청별로 채우므로 공유 한도·캐시 오염이 없다.
 *
 * 캐시 불가: IP 마다 값이 달라 캐시하면 한 사용자의 위치가 다른 사용자에게 새어나간다 →
 *   응답에 `Cache-Control: no-store`.
 *
 * 로컬 dev 에는 Vercel 헤더가 없어 lat/lon 이 비어 404 → 호출부(useWeather)가 대치동 폴백.
 */

export const runtime = "nodejs";

export async function GET(req: Request) {
  const h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lon = Number(h.get("x-vercel-ip-longitude"));

  // 유한수일 것 + (0,0) 거부: 일부 프록시·dev 환경은 측위 불가 IP 에 lat/lon 을 "0" 으로 채운다.
  //   0,0 은 기니만 한복판(Null Island)이라 위치로 쓰면 오히려 틀린 좌표를 보여주게 됨 → 404 로 처리해
  //   호출부가 대치동으로 폴백하게 한다(이 기능의 목적은 '쓸만한 대략위치', 무효 sentinel 노출 아님).
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return NextResponse.json({ error: true }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // x-vercel-ip-city 는 URL-encoded(예: "Seoul", "Gangnam-gu") — decode. 없으면 null.
  const rawCity = h.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity);
    } catch {
      city = rawCity;
    }
  }

  return NextResponse.json({ lat, lon, city }, { headers: { "Cache-Control": "no-store" } });
}
