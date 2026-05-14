-- 0079: get_notifications RPC RETURN TABLE에 url 컬럼 추가
--
-- 알림 클릭 시 notifications.url(이미 0071 migration에서 /{handle}/{shortcode} 또는
-- /admin/cards/{id}/edit로 정합)로 바로 이동하기 위해 응답에 포함.
-- 기존 0073의 RPC는 url을 응답에서 누락해 클라이언트가 fallback URL 사용 중이었음.

DROP FUNCTION IF EXISTS public.get_notifications(integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_notifications(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(
  id bigint,
  kind text,
  card_id bigint,
  comment_id bigint,
  actor_id uuid,
  actor_display_name text,
  actor_avatar_url text,
  actor_handle text,
  card_question text,
  url text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
  )
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.question AS card_question,
    n.url,
    n.read_at, n.created_at
  FROM public.notifications n
  JOIN me ON me.id = n.recipient_id
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
  LEFT JOIN public.doctors d ON d.id = da.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  ORDER BY n.created_at DESC
  OFFSET p_offset LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_notifications(integer, integer) TO authenticated;

SELECT 'OK 0079' AS status;
