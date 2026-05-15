-- 0091: persona 시스템 잔재 완전 제거
-- 0090에서 누락된 부분:
--   1. card_ratings.persona 컬럼 + PK (card_id, user_id, persona) 잔존
--   2. get_recent_card_likers_batch RPC가 이미 drop된 card_likes.persona 참조 (호출 시 에러)
-- official/personal 개념 자체를 제거 — 단일 user_id 기준만 사용.

BEGIN;

-- ── 1) card_ratings 정리 ──
-- 기존 PK 제거 후 (card_id, user_id) 단일 PK로 재설정.
ALTER TABLE public.card_ratings DROP CONSTRAINT IF EXISTS card_ratings_pkey;
ALTER TABLE public.card_ratings DROP COLUMN IF EXISTS persona;
ALTER TABLE public.card_ratings ADD PRIMARY KEY (card_id, user_id);

-- ── 2) get_recent_card_likers_batch RPC 재정의 (persona 필드/참조 제거) ──
DROP FUNCTION IF EXISTS public.get_recent_card_likers_batch(bigint[], integer);
CREATE OR REPLACE FUNCTION public.get_recent_card_likers_batch(
  p_card_ids bigint[],
  p_limit_per_card integer DEFAULT 3
)
RETURNS TABLE(
  card_id bigint,
  user_id uuid,
  display_name text,
  avatar_url text,
  handle text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT card_id, user_id, display_name, avatar_url, handle, created_at
  FROM (
    SELECT
      l.card_id,
      l.user_id,
      p.display_name,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      p.handle,
      l.created_at,
      ROW_NUMBER() OVER (PARTITION BY l.card_id ORDER BY l.created_at DESC) AS rn
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE l.card_id = ANY(p_card_ids)
  ) ranked
  WHERE rn <= p_limit_per_card
  ORDER BY card_id, created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_recent_card_likers_batch(bigint[], integer) TO authenticated, anon;

COMMIT;

SELECT 'OK 0091' AS status;
