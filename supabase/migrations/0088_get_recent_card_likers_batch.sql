-- 0088 — get_recent_card_likers_batch
--
-- 배경: 홈 1로드에 카드 N개가 마운트되면 RecentLikers 컴포넌트가 카드별로
--       get_recent_card_likers RPC를 1회씩 호출 (홈 21장 → 21+ 콜).
--       배치 RPC로 1회에 N장 분의 likers를 가져올 수 있게 한다.
--
-- 출력: card_id 컬럼이 추가된 RETURN TABLE — 클라이언트가 cardId별로 분류.

CREATE OR REPLACE FUNCTION public.get_recent_card_likers_batch(
  p_card_ids bigint[],
  p_limit_per_card integer DEFAULT 3
)
RETURNS TABLE(
  card_id bigint,
  user_id uuid,
  persona text,
  display_name text,
  avatar_url text,
  handle text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT card_id, user_id, persona, display_name, avatar_url, handle, created_at
  FROM (
    SELECT
      l.card_id,
      l.user_id,
      l.persona::text AS persona,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_card_likers_batch(bigint[], integer)
  TO authenticated, anon;

SELECT 'OK 0088' AS status;
