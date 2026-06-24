-- 0287_recent_views.sql
-- "최근 본 글" 기능 지원: card_views 조회 인덱스 + 본인 검증형 RPC 2개.
--
-- 1) (profile_id, created_at DESC) partial 인덱스 — 본인 최근 조회 빠른 정렬.
-- 2) get_my_recent_views        — card 단위 최신 1건 중복제거, 최근순 limit.
-- 3) get_my_recent_view_count   — distinct card 수.
--
-- 두 RPC 모두 SECURITY DEFINER + SET search_path=public,pg_temp.
-- 본인 검증 필수: p_profile_id 가 호출자(auth.uid()) 소유 명함인지 확인
-- (create_procedure_review 의 not_authorized_author 패턴과 동일).

CREATE INDEX IF NOT EXISTS idx_card_views_profile_created
  ON public.card_views (profile_id, created_at DESC)
  WHERE profile_id IS NOT NULL;

-- a) 최근 본 글 목록 (card 단위 중복제거 후 최근순)
CREATE OR REPLACE FUNCTION public.get_my_recent_views(
  p_profile_id uuid,
  p_limit int DEFAULT 30
)
RETURNS TABLE(card_id bigint, last_viewed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH dedup AS (
    SELECT DISTINCT ON (v.card_id)
           v.card_id        AS card_id,
           v.created_at      AS last_viewed_at
    FROM public.card_views v
    JOIN public.cards c ON c.id = v.card_id
    WHERE v.profile_id = p_profile_id
      AND c.deleted_at IS NULL
      AND c.status = 'published'
    ORDER BY v.card_id, v.created_at DESC
  )
  SELECT dedup.card_id, dedup.last_viewed_at
  FROM dedup
  ORDER BY dedup.last_viewed_at DESC
  LIMIT GREATEST(p_limit, 0);
END
$function$;

-- b) 최근 본 글 distinct card 수
CREATE OR REPLACE FUNCTION public.get_my_recent_view_count(
  p_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(DISTINCT v.card_id) INTO v_count
  FROM public.card_views v
  JOIN public.cards c ON c.id = v.card_id
  WHERE v.profile_id = p_profile_id
    AND c.deleted_at IS NULL
    AND c.status = 'published';

  RETURN COALESCE(v_count, 0);
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_recent_views(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_recent_view_count(uuid) TO authenticated;
