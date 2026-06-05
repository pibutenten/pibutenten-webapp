-- 0243_get_notifications_message.sql
-- 2026-06-06 — 앱 알림함(/notifications) 목록 RPC 에 message 컬럼 추가 (4-2 / 3a).
--
-- 배경:
--   /notifications 페이지는 get_notifications RPC 를 쓰는데, 이 함수가 message 를 반환하지 않아
--   내용이 message 에 담긴 알림(저장="N명이 저장", 곧 추가될 관심 키워드)이 앱 목록에서
--   라벨만 밋밋하게 보였다(푸시 팝업엔 정상). 디렉터 결정: 앱 목록에도 내용 표시.
--   (dropdown RPC get_my_notifications 는 이미 message 를 반환 → 무변경.)
--
-- 변경:
--   get_notifications 의 RETURNS TABLE 에 message 컬럼 1개 추가 + SELECT 에 n.message.
--   나머지(정렬·필터·recipient 스코핑 JOIN active a ON a.id=n.recipient_id·SECURITY DEFINER) VERBATIM.
--   RETURNS TABLE 변경이라 CREATE OR REPLACE 불가 → DROP + CREATE. proacl=null(기본 PUBLIC EXECUTE)
--   이므로 새 함수도 동일하게 기본 부여 — 명시 GRANT 불필요(VERBATIM 유지).

BEGIN;

DROP FUNCTION IF EXISTS public.get_notifications(uuid, integer, integer);

CREATE FUNCTION public.get_notifications(p_active_profile_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30)
 RETURNS TABLE(id bigint, kind text, card_id bigint, comment_id bigint, actor_id uuid, actor_display_name text, actor_avatar_url text, actor_handle text, card_title text, message text, url text, read_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH active AS (
    SELECT public.validate_active_profile_id(p_active_profile_id) AS id
  )
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.title AS card_title,
    n.message,
    n.url, n.read_at, n.created_at
  FROM public.notifications n
  JOIN active a ON a.id IS NOT NULL AND a.id = n.recipient_id
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  -- 0176: doctor_accounts JOIN 폐기. profiles.doctor_id 로 doctors 직접 JOIN.
  LEFT JOIN public.doctors d ON d.id = p.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  ORDER BY n.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$function$;

COMMIT;

SELECT 'OK 0243' AS status;
