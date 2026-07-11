-- 0357: traffic_landings — 유입 분석(Acquisition) 수집 테이블 + 집계 RPC (2026-07-11)
--
-- 목적: "어디서·어떻게 들어왔는지"를 admin 대시보드에서 자체 집계.
--   채널(검색/SNS/메신저/직접/앱) · 유입처 도메인 · 랜딩 페이지 · UTM · 기기/OS · 인앱 · 대략 지역.
--   ⚠ "무슨 검색어로 찾았는지"(오가닉 검색어)는 검색엔진이 referrer 로 안 넘겨 자체 수집 불가 —
--     Google Search Console / 네이버 서치어드바이저로만 확인(별도 등록). 이 테이블 범위 밖.
--
-- 수집 경로: 클라 비컨(LandingTracker) → POST /api/landing → 서버가 채널 분류·UA/지역 파싱 후 INSERT.
--   세션 첫 진입 1회만(클라 sessionStorage dedup). IP 원본은 저장하지 않음(국가/지역 코스만 — PIPA).
--
-- 구 리서치 패널(get_research_panel, 0224)은 이 대시보드로 대체(원장 요청 2026-07-11) — 함수는 존치(무해).

BEGIN;

CREATE TABLE IF NOT EXISTS public.traffic_landings (
  id            BIGSERIAL PRIMARY KEY,
  landed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  landing_path  TEXT,
  referrer_host TEXT,                 -- 유입처 도메인(예: google.com, m.search.naver.com). 직접이면 NULL
  channel       TEXT NOT NULL,        -- API 에서 분류: search_google/search_naver/search_daum/search_bing/
                                      --   social_instagram/social_youtube/social_facebook/social_x/social_threads/
                                      --   messenger_kakao/messenger_line/referral/direct/app/internal
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_term      TEXT,
  utm_content   TEXT,
  device        TEXT,                 -- mobile/tablet/desktop
  os            TEXT,                 -- ios/android/windows/macos/other
  in_app        TEXT,                 -- kakaotalk/instagram/facebook/naver/line (없으면 NULL)
  country       TEXT,                 -- Vercel IP 지오(예: KR). IP 원본 미저장
  region        TEXT,                 -- Vercel IP 지오 시/지역
  is_member     BOOLEAN NOT NULL DEFAULT false  -- 랜딩 시 로그인 상태였는지(참고)
);

CREATE INDEX IF NOT EXISTS idx_traffic_landings_landed ON public.traffic_landings (landed_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_landings_channel ON public.traffic_landings (channel, landed_at DESC);

-- RLS: anon/authenticated INSERT 허용(API 라우트가 방문자 컨텍스트로 적재). SELECT 는 admin RPC(정의자)만.
ALTER TABLE public.traffic_landings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS traffic_landings_insert ON public.traffic_landings;
CREATE POLICY traffic_landings_insert ON public.traffic_landings
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 직접 SELECT 는 아무에게도 허용 안 함(집계는 SECURITY DEFINER RPC 경유). admin 도 RPC 만.
DROP POLICY IF EXISTS traffic_landings_no_select ON public.traffic_landings;

GRANT INSERT ON public.traffic_landings TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.traffic_landings_id_seq TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 집계 RPC: get_traffic_overview(p_days) — admin 전용(is_admin 가드). jsonb 반환.
--   p_days<=0 = 전체 기간. 채널/유입처/랜딩/기기/OS/인앱/캠페인/일별 추이.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_traffic_overview(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_total bigint;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '42501';
  END IF;

  v_since := CASE WHEN COALESCE(p_days, 0) <= 0
                  THEN '-infinity'::timestamptz
                  ELSE now() - (p_days || ' days')::interval END;

  SELECT count(*) INTO v_total
  FROM public.traffic_landings WHERE landed_at >= v_since;

  v_result := jsonb_build_object(
    'total', v_total,
    'by_channel', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT channel,
               count(*)::bigint AS count,
               round(100.0 * count(*) / NULLIF(v_total, 0), 1) AS pct
        FROM public.traffic_landings WHERE landed_at >= v_since
        GROUP BY channel ORDER BY count(*) DESC
      ) x), '[]'::jsonb),
    'top_referrers', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT referrer_host AS host, count(*)::bigint AS count
        FROM public.traffic_landings
        WHERE landed_at >= v_since AND referrer_host IS NOT NULL
        GROUP BY referrer_host ORDER BY count(*) DESC LIMIT 15
      ) x), '[]'::jsonb),
    'top_landings', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT landing_path AS path, count(*)::bigint AS count
        FROM public.traffic_landings
        WHERE landed_at >= v_since AND landing_path IS NOT NULL
        GROUP BY landing_path ORDER BY count(*) DESC LIMIT 15
      ) x), '[]'::jsonb),
    'by_device', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(device, 'unknown') AS device, count(*)::bigint AS count
        FROM public.traffic_landings WHERE landed_at >= v_since
        GROUP BY COALESCE(device, 'unknown') ORDER BY count(*) DESC
      ) x), '[]'::jsonb),
    'by_os', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(os, 'other') AS os, count(*)::bigint AS count
        FROM public.traffic_landings WHERE landed_at >= v_since
        GROUP BY COALESCE(os, 'other') ORDER BY count(*) DESC
      ) x), '[]'::jsonb),
    'by_in_app', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT in_app, count(*)::bigint AS count
        FROM public.traffic_landings
        WHERE landed_at >= v_since AND in_app IS NOT NULL
        GROUP BY in_app ORDER BY count(*) DESC
      ) x), '[]'::jsonb),
    'by_campaign', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT utm_campaign AS campaign,
               utm_source AS source,
               count(*)::bigint AS count
        FROM public.traffic_landings
        WHERE landed_at >= v_since AND utm_campaign IS NOT NULL
        GROUP BY utm_campaign, utm_source ORDER BY count(*) DESC LIMIT 20
      ) x), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.d) FROM (
        SELECT (landed_at AT TIME ZONE 'Asia/Seoul')::date AS d,
               count(*)::bigint AS count
        FROM public.traffic_landings WHERE landed_at >= v_since
        GROUP BY (landed_at AT TIME ZONE 'Asia/Seoul')::date
      ) x), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_traffic_overview(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_traffic_overview(integer) TO authenticated;

COMMIT;
