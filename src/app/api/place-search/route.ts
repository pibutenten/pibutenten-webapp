import { NextResponse } from "next/server";

/**
 * 지명·랜드마크 검색 → 좌표 (네이버 지역검색 Open API, 서버 전용).
 * - 시술일기 "어디서 받으셨어요?" 에서 '강남역' 같은 지명을 좌표로 바꿔 지도 이동용.
 * - openapi.naver.com 은 브라우저 CORS 차단 → 서버에서 NAVER_CLIENT_ID/SECRET 로 호출.
 * - local.json mapx/mapy 는 WGS84 ×10^7 (예: 1270276242 → 127.0276242).
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ place: null });

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return NextResponse.json({ place: null, error: "no-key" });

  try {
    const r = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=1`,
      {
        headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
        cache: "no-store",
      },
    );
    if (!r.ok) return NextResponse.json({ place: null });
    const data = await r.json();
    const it = data?.items?.[0];
    if (!it) return NextResponse.json({ place: null });
    const lng = parseInt(it.mapx, 10) / 1e7;
    const lat = parseInt(it.mapy, 10) / 1e7;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ place: null });
    const name = String(it.title ?? "").replace(/<[^>]+>/g, "");
    return NextResponse.json({ place: { lat, lng, name } });
  } catch {
    return NextResponse.json({ place: null });
  }
}
