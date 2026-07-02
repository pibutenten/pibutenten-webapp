import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { safeEqual } from "@/lib/auth/timing";

/**
 * IndexNow Cron — 직전 26h 내 발행/갱신된 의사 Q&A 글을
 *   Bing/Yandex/Seznam/Yep 에 일괄 통보.
 *
 * 호출: Vercel Cron (vercel.json crons 정의, 한국시간 04:00 KST 매일 1회).
 * 인증: Authorization: Bearer ${CRON_SECRET}
 *   - Vercel Cron 은 자동으로 CRON_SECRET env 값을 위 헤더로 첨부.
 *   - 외부 무단 호출 차단.
 *
 * IndexNow:
 *   - 프로토콜: https://www.indexnow.org/documentation
 *   - key: 32+자 hex/UUID. `public/${INDEXNOW_KEY}.txt` 에 동일 값으로 호스팅 (소유권 증명).
 *   - 4개 검색엔진 (Bing/Yandex/Seznam.cz/Yep) 공유 key pool.
 *   - Google/Naver 미지원.
 *
 * 회원 글 제외 — sitemap.ts / rss.xml 정책과 동일:
 *   status='published' AND category='qa' AND doctor_id IS NOT NULL.
 *
 * race window 보정 — 26h 윈도우:
 *   - daily cron 의 정확한 발화 시각이 ±몇 분 단위로 흔들려도 누락 없도록.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

type DoctorRel = { slug: string } | { slug: string }[] | null;
type CardRow = {
  post_slug: string | null;
  post_year: number | null;
  doctor: DoctorRel;
};

export async function GET(req: Request) {
  // Bearer 접두 파싱 후 timing-safe 비교 (`===` 조기 종료 side-channel 차단).
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!secret || !safeEqual(token, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return Response.json(
      { ok: false, error: "INDEXNOW_KEY env not set" },
      { status: 500 },
    );
  }

  const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  const supabase = await createSupabaseServerClient();
  const { data: cards, error } = await supabase
    .from("cards")
    .select("post_slug, post_year, doctor:doctors(slug)")
    .eq("status", "published")
    .eq("category", "qa")
    .not("doctor_id", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const urls = ((cards ?? []) as CardRow[]).flatMap((c) => {
    const doc = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
    if (!doc?.slug || !c.post_year || !c.post_slug) return [];
    return [
      `${SITE_URL}/doctors/${doc.slug}/${c.post_year}/${encodeURIComponent(c.post_slug)}`,
    ];
  });

  if (urls.length === 0) {
    return Response.json({ ok: true, pingedCount: 0, since, note: "no new urls" });
  }

  const host = new URL(SITE_URL).host;
  const keyLocation = `${SITE_URL}/${key}.txt`;

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
  });

  // IndexNow 응답 코드:
  //   200/202 OK / Accepted
  //   400 Bad Request (잘못된 host/key 형식)
  //   403 Forbidden (key 가 keyLocation 에서 안 보임)
  //   422 Unprocessable (host 가 keyLocation host 와 불일치)
  return Response.json({
    ok: res.ok,
    indexNowStatus: res.status,
    pingedCount: urls.length,
    since,
  });
}
