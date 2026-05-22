-- 0147: get_doctor_kpi RPC — 원장 본인 글 지표 6개 (2026-05-22)
--
-- 사용자 결정: 원장 대시보드 KPI = 본인 글에 대한 사람들 반응만.
--   1. views_received      — 본인 카드 누적 조회수 (distinct visitor × KST 날짜, 같은 사람 다른날 +1)
--   2. comments_received   — 본인 카드에 달린 댓글 row count (활성 댓글만)
--   3. saves_received      — 본인 카드 저장 row count
--   4. shares_received     — 본인 카드 공유 row count
--   5. published_total     — 본인 카드 중 status='published' 누적 (p_days 무관)
--   6. pending_review      — 본인 카드 중 검수 대기 (p_days 무관)
--
-- '본인 카드' 정의: cards.author_id = p_profile_id OR cards.doctor_id = p_doctor_id
--   (doctor primary profile 가 author 인 경우와 다른 묶음 profile 이 author 인 케이스 모두 포함)
--
-- 권한: SECURITY DEFINER + is_admin() OR 본인 doctor_id 매칭 호출자만.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_doctor_kpi_inner(
  p_doctor_id uuid,
  p_profile_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(
  views_received bigint,
  comments_received bigint,
  saves_received bigint,
  shares_received bigint,
  published_total bigint,
  pending_review bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  ),
  -- 본인 카드 id 집합 (author_id OR doctor_id 매칭, deleted_at 제외)
  my_cards AS (
    SELECT id
      FROM public.cards
     WHERE (author_id = p_profile_id OR doctor_id = p_doctor_id)
       AND deleted_at IS NULL
  )
  SELECT
    -- 1. views_received — distinct (visitor × KST 날짜)
    (SELECT count(DISTINCT (
       COALESCE(v.user_id::text, v.session_id),
       (v.created_at AT TIME ZONE 'Asia/Seoul')::date
     ))::bigint
       FROM public.card_views v, bounds b
      WHERE v.created_at >= b.since
        AND v.card_id IN (SELECT id FROM my_cards)
        AND (v.user_id IS NOT NULL OR v.session_id IS NOT NULL)) AS views_received,
    -- 2. comments_received
    (SELECT count(*)::bigint
       FROM public.comments c, bounds b
      WHERE c.created_at >= b.since
        AND c.status = 'visible'
        AND c.card_id IN (SELECT id FROM my_cards)) AS comments_received,
    -- 3. saves_received
    (SELECT count(*)::bigint
       FROM public.card_saves s, bounds b
      WHERE s.created_at >= b.since
        AND s.card_id IN (SELECT id FROM my_cards)) AS saves_received,
    -- 4. shares_received
    (SELECT count(*)::bigint
       FROM public.card_shares sh, bounds b
      WHERE sh.created_at >= b.since
        AND sh.card_id IN (SELECT id FROM my_cards)) AS shares_received,
    -- 5. published_total — 시간 윈도우 무관, 현재 발행중 카드 총수
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'published'
        AND c.deleted_at IS NULL) AS published_total,
    -- 6. pending_review — 시간 윈도우 무관, 현재 검수 대기 카드 총수
    (SELECT count(*)::bigint
       FROM public.cards c
      WHERE (c.author_id = p_profile_id OR c.doctor_id = p_doctor_id)
        AND c.status = 'pending_review'
        AND c.deleted_at IS NULL) AS pending_review;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_kpi_inner(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_kpi_inner(uuid, uuid, integer) TO authenticated;

-- Wrapper — admin 또는 본인 doctor 만 호출 가능
CREATE OR REPLACE FUNCTION public.get_doctor_kpi(
  p_doctor_id uuid,
  p_profile_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(
  views_received bigint,
  comments_received bigint,
  saves_received bigint,
  shares_received bigint,
  published_total bigint,
  pending_review bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_is_self boolean;
BEGIN
  -- self check: caller 가 doctor_accounts 매핑으로 같은 doctor_id 보유?
  SELECT EXISTS (
    SELECT 1
      FROM public.doctor_accounts da
      JOIN public.profiles p ON p.id = da.profile_id
     WHERE da.doctor_id = p_doctor_id
       AND p.auth_user_id = auth.uid()
  ) INTO v_is_self;

  IF NOT public.is_admin() AND NOT v_is_self THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.get_doctor_kpi_inner(p_doctor_id, p_profile_id, p_days);
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_kpi(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_kpi(uuid, uuid, integer) TO authenticated;

COMMIT;
