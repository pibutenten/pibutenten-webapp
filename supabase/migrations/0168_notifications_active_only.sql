-- 0168_notifications_active_only.sql
--
-- 알림 조회·읽음 처리를 active profile 한 장 기준으로 통일 (Critical-2 DB 레이어 보강).
--
-- 배경:
--   0062 / 0073 / 0079 / 0080 에 정의된 알림 RPC 들이 모두 묶음(bundle) OR 패턴
--     "WHERE id = auth.uid() OR auth_user_id = auth.uid()" 을 사용해 호출자의 묶음 전체
--   profile 의 알림을 합산 반환. 그래서 같은 묶음 안에 doctor profile 이 있으면 일반
--   회원·관리자 신분으로 active 일 때도 그 doctor 의 알림이 노출되는 회귀 발생.
--   (사용자 보고: 배스킨 회원 명함에서 '새 궁금해요' 알림 노출)
--
-- 정책 (CLAUDE.md 원칙 #1 — "권한·정체성 판정은 active profile 한 장 단위"):
--   알림 조회·읽음 처리 모두 active profile 한 장 기준으로만 수행.
--   호출자가 active.profileId 를 명시 전달하고, RPC 는 그 값이 호출자의 묶음에
--   속하는지 검증한 뒤 recipient_id = active 한 장만 매칭한다.
--
-- 변경:
--   - 새 헬퍼: validate_active_profile_id(uuid) — 위조 차단.
--   - 5 RPC 시그니처에 p_active_profile_id uuid 추가:
--       get_my_notifications, get_notifications, get_my_unread_count,
--       mark_my_notifications_read, mark_notifications_read.
--   - 모든 RPC 는 active 가 호출자 묶음에 없으면 빈 결과/no-op (fail-closed).
--
-- 회귀 위험:
--   - 애플리케이션 코드가 active.profileId 를 전달하지 않으면 빈 결과/0 반환.
--     관련 API 라우트(/api/notifications, /api/notifications/read) 동시 수정 필요.
--   - RLS 정책(0114 same_group_profile_ids) 은 그대로 둠 — 본 마이그레이션은 RPC
--     레벨에서 active 한 장으로 좁히는 패턴. 향후 RLS 도 동일 패턴으로 좁힐 수 있으나,
--     SECURITY DEFINER RPC 만 경유하면 RLS 는 추가 방어선 역할.

-- ─────────────────────────────────────────────────────────────
-- 0. 위조 차단 헬퍼
-- ─────────────────────────────────────────────────────────────
-- p_active 가 auth.uid() 묶음(같은 auth_user_id) 에 속하는 profile.id 면 그 값,
-- 아니면 NULL 반환. 모든 알림 RPC 가 이 함수로 좁힘.
CREATE OR REPLACE FUNCTION public.validate_active_profile_id(p_active uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles
   WHERE id = p_active
     AND (id = auth.uid() OR auth_user_id = auth.uid())
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.validate_active_profile_id(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 1. get_my_notifications — 종 dropdown 용
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_notifications(integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_my_notifications(
  p_active_profile_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id bigint, kind text, actor_id uuid, actor_name text, actor_handle text,
  card_id bigint, comment_id bigint, message text, url text,
  read_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH active AS (
    SELECT public.validate_active_profile_id(p_active_profile_id) AS id
  )
  SELECT n.id, n.kind, n.actor_id, p.display_name AS actor_name,
         p.handle AS actor_handle, n.card_id, n.comment_id,
         n.message, n.url, n.read_at, n.created_at
    FROM public.notifications n
    JOIN active a ON a.id IS NOT NULL AND a.id = n.recipient_id
    LEFT JOIN public.profiles p ON p.id = n.actor_id
   ORDER BY n.created_at DESC
   LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(uuid, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. get_notifications — /notifications 페이지 (offset 기반)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_notifications(integer, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.get_notifications(
  p_active_profile_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(
  id bigint, kind text, card_id bigint, comment_id bigint,
  actor_id uuid, actor_display_name text, actor_avatar_url text, actor_handle text,
  card_question text, url text, read_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH active AS (
    SELECT public.validate_active_profile_id(p_active_profile_id) AS id
  )
  SELECT n.id, n.kind, n.card_id, n.comment_id, n.actor_id,
    p.display_name AS actor_display_name,
    COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS actor_avatar_url,
    p.handle AS actor_handle,
    c.question AS card_question,
    n.url, n.read_at, n.created_at
  FROM public.notifications n
  JOIN active a ON a.id IS NOT NULL AND a.id = n.recipient_id
  LEFT JOIN public.profiles p ON p.id = n.actor_id
  LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
  LEFT JOIN public.doctors d ON d.id = da.doctor_id
  LEFT JOIN public.cards c ON c.id = n.card_id
  ORDER BY n.created_at DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_notifications(uuid, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. get_my_unread_count — 종 빨간 점 카운트
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_unread_count() CASCADE;
CREATE OR REPLACE FUNCTION public.get_my_unread_count(
  p_active_profile_id uuid
)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
    FROM public.notifications n
   WHERE n.read_at IS NULL
     AND n.recipient_id = public.validate_active_profile_id(p_active_profile_id);
$$;
GRANT EXECUTE ON FUNCTION public.get_my_unread_count(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. mark_my_notifications_read — 일괄 (ask 본인 미답 24h 제외 정책 유지)
-- ─────────────────────────────────────────────────────────────
-- 정책 (0080 유지): 본인 'ask' 카드에 달린 'comment' 알림 중 24h 이내 + 본인이 아직
-- 답글 안 단 것은 자동 read 에서 제외 (사용자가 직접 행동해야 정리됨).
DROP FUNCTION IF EXISTS public.mark_my_notifications_read() CASCADE;
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read(
  p_active_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid;
BEGIN
  v_me := public.validate_active_profile_id(p_active_profile_id);
  IF v_me IS NULL THEN RETURN; END IF;

  UPDATE public.notifications n
     SET read_at = now()
   WHERE n.recipient_id = v_me
     AND n.read_at IS NULL
     AND NOT (
       n.kind = 'comment'
       AND n.created_at >= now() - interval '24 hours'
       AND EXISTS (
         SELECT 1 FROM public.cards c
          WHERE c.id = n.card_id
            AND c.author_id = v_me
            AND c.category = 'ask'
       )
       AND NOT EXISTS (
         -- comments.author_id 는 auth.users.id 이므로 묶음 공통 키.
         -- active profile 의 묶음(=auth.uid()) 이 댓글을 단 적이 있는지 검사.
         SELECT 1 FROM public.comments c2
          WHERE c2.card_id = n.card_id
            AND c2.status = 'visible'
            AND c2.author_id = auth.uid()
       )
     );
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. mark_notifications_read — 명시 ID(즉시 read) / NULL(=일괄, 정책 적용)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.mark_notifications_read(bigint[]) CASCADE;
CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_ids bigint[],
  p_active_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_me uuid;
BEGIN
  v_me := public.validate_active_profile_id(p_active_profile_id);
  IF v_me IS NULL THEN RETURN 0; END IF;

  IF p_ids IS NULL THEN
    UPDATE public.notifications n
       SET read_at = now()
     WHERE n.recipient_id = v_me
       AND n.read_at IS NULL
       AND NOT (
         n.kind = 'comment'
         AND n.created_at >= now() - interval '24 hours'
         AND EXISTS (
           SELECT 1 FROM public.cards c
            WHERE c.id = n.card_id
              AND c.author_id = v_me
              AND c.category = 'ask'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.comments c2
            WHERE c2.card_id = n.card_id
              AND c2.status = 'visible'
              AND c2.author_id = auth.uid()
         )
       );
  ELSE
    -- 명시 ID 지정 — 사용자 직접 행동이므로 제외 없음
    UPDATE public.notifications
       SET read_at = now()
     WHERE recipient_id = v_me
       AND id = ANY(p_ids)
       AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(bigint[], uuid) TO authenticated;

SELECT 'OK 0168' AS status;
