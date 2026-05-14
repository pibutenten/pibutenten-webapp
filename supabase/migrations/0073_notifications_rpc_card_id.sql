-- 0073: get_my_notifications + get_notifications RETURN TABLE 의 qa_id → card_id (DROP+CREATE 필요)

DROP FUNCTION IF EXISTS public.get_my_notifications(integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 20)
RETURNS TABLE(id bigint, kind text, actor_id uuid, actor_name text, actor_handle text,
              card_id bigint, comment_id bigint, message text, url text,
              read_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
  )
  SELECT n.id, n.kind, n.actor_id, p.display_name AS actor_name,
         p.handle AS actor_handle, n.card_id, n.comment_id,
         n.message, n.url, n.read_at, n.created_at
    FROM public.notifications n
    JOIN me ON me.id = n.recipient_id
    LEFT JOIN public.profiles p ON p.id = n.actor_id
   ORDER BY n.created_at DESC LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_notifications(integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_notifications(p_offset integer DEFAULT 0, p_limit integer DEFAULT 30)
RETURNS TABLE(id bigint, kind text, card_id bigint, comment_id bigint,
              actor_id uuid, actor_display_name text, actor_avatar_url text, actor_handle text,
              card_question text, read_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.question AS card_question,
    n.read_at, n.created_at
  FROM public.notifications n
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
  LEFT JOIN public.doctors d ON d.id = da.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  WHERE n.recipient_id = auth.uid()
  ORDER BY n.created_at DESC
  OFFSET p_offset LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_notifications(integer, integer) TO authenticated;

SELECT 'OK 0073' AS status;
