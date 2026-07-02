import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";

/**
 * 지명·랜드마크 검색 → 좌표 (네이버 지역검색 Open API, 서버 전용).
 * - 시술노트 "어디서 받으셨어요?" 에서 '강남역' 같은 지명을 좌표로 바꿔 지도 이동용.
 * - openapi.naver.com 은 브라우저 CORS 차단 → 서버에서 NAVER_CLIENT_ID/SECRET 로 호출.
 * - local.json mapx/mapy 는 WGS84 ×10^7 (예: 1270276242 → 127.0276242).
 *
 * 보안:
 *  - 로그인 사용자만 호출 가능 (anon DoS 방지 — 네이버 Open API 일일 쿼터 소진 차단).
 *  - rate limit: 사용자당 분당 30회 (og-extract 와 동일 정책).
 *  - 401/429 응답도 place:null 폴백 형태 유지 → 호출자(시술노트 작성 화면) 안정.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  // 인증 필수 (anon DoS 방지) — og-extract 와 동일 방식.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(null, "unauthorized", "[place-search] auth required", 401, undefined, {
      userMessage: "로그인이 필요합니다",
      bodyExtra: { place: null },
    });
  }

  // Rate limit: 사용자당 분당 30회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "place-search",
    userId: user.id,
    max: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ place: null });
  // 네이버 쿼터 보호 — 정상 지명 검색 범위를 벗어난 초장문 쿼리 차단.
  if (q.length > 100) return NextResponse.json({ place: null });

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
