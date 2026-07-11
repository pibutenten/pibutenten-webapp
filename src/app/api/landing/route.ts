import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  classifyChannel,
  detectDevice,
  detectInApp,
  detectOs,
  referrerHost,
} from "@/lib/traffic-classify";

/**
 * POST /api/landing — 유입 분석(Acquisition) 랜딩 비컨.
 *
 * LandingTracker(클라)가 세션 첫 진입 1회만 호출(sessionStorage dedup). 서버가 referrer 도메인·
 * 인앱 UA·UTM 으로 채널을 분류하고 UA/Vercel 지오를 파싱해 traffic_landings 에 적재(RLS: anon INSERT).
 * IP 원본은 저장하지 않음(국가/지역 코스만 — PIPA). best-effort — 실패해도 조용히 204.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가벼운 IP 인메모리 rate limit — anon 비컨 스팸 적재(집계 오염) 완화(디비검수 [중요-2] 옵션 A).
//   60초 창 30회 초과면 조용히 버림. 서버 인스턴스 재기동 시 리셋되나 casual 남용 저지엔 충분.
//   (근본 대량 방어는 Vercel WAF + 90일 보관 정리 백로그.)
const RL = new Map<string, { n: number; ts: number }>();
const RL_WINDOW = 60_000;
const RL_MAX = 30;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = RL.get(ip);
  if (!e || now - e.ts > RL_WINDOW) {
    RL.set(ip, { n: 1, ts: now });
    if (RL.size > 5000) for (const [k, v] of RL) if (now - v.ts > RL_WINDOW) RL.delete(k);
    return false;
  }
  e.n += 1;
  return e.n > RL_MAX;
}

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(req: Request) {
  try {
    // IP 추출(Vercel: x-forwarded-for 첫 값) 후 rate limit.
    const ip =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      referrer?: string;
      search?: string;
      isMember?: boolean;
      isApp?: boolean;
    };

    // 랜딩 경로 — 우리 사이트 내부 경로만(방어). 없거나 이상하면 "/".
    let path = clip(body.path, 300) ?? "/";
    if (!path.startsWith("/")) path = "/";

    const ua = req.headers.get("user-agent") ?? "";
    const inApp = detectInApp(ua);
    const host = referrerHost(body.referrer);

    // UTM — 클라가 보낸 search(location.search) 파싱.
    const params = new URLSearchParams(clip(body.search, 500) ?? "");
    const utmSource = clip(params.get("utm_source"), 100);
    const utmMedium = clip(params.get("utm_medium"), 100);
    const utmCampaign = clip(params.get("utm_campaign"), 150);
    const utmTerm = clip(params.get("utm_term"), 150);
    const utmContent = clip(params.get("utm_content"), 150);

    // 네이티브 앱(Capacitor) 진입은 referrer/UTM 과 무관하게 "앱" 채널로 분리(클라가 확정 전달).
    const channel = body.isApp === true
      ? "app"
      : classifyChannel({ host, inApp, utmSource, utmMedium });

    const h = req.headers;
    const country = clip(h.get("x-vercel-ip-country"), 8);
    let region = clip(h.get("x-vercel-ip-city"), 80) ?? clip(h.get("x-vercel-ip-country-region"), 80);
    if (region) {
      try {
        region = decodeURIComponent(region);
      } catch {
        /* keep raw */
      }
    }

    const supabase = await createSupabaseServerClient();
    await supabase.from("traffic_landings").insert({
      landing_path: path,
      referrer_host: host,
      channel,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent,
      device: detectDevice(ua),
      os: detectOs(ua),
      in_app: inApp,
      country,
      region,
      is_member: body.isMember === true,
    });

    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    // 수집 실패가 사용자 경험을 깨면 안 됨 — 조용히 성공 처리.
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
