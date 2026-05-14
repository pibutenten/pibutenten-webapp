-- 0062: 알림 시스템 — schema + RLS + triggers
--
-- 종류 (kind):
--   'comment'        : 내 글에 댓글
--   'reply'          : 내 댓글에 답글
--   'like'           : 내 글에 좋아요 (24시간 debounce — 같은 qa+recipient 1일 1회)
--   'new_ask'        : 회원이 '궁금해요' 글 등록 → 모든 원장 알림
--   'review_request' : 카드 검수 요청 → doctor profile
--   'published'      : pending_review → published 전환 → author 알림

-- 1. 테이블 (이전 버전에 message/url 없을 수 있어 ALTER 보강)
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  recipient_id uuid NOT NULL,
  kind text NOT NULL,
  actor_id uuid,
  qa_id bigint REFERENCES public.qas(id) ON DELETE CASCADE,
  comment_id bigint REFERENCES public.comments(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS url text;

-- 기존 알림 데이터는 v1 — 새 시스템과 호환 안 됨 → 일괄 삭제 (정책: 알림은 휘발성)
DELETE FROM public.notifications;

-- kind 값 제약
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('comment','reply','like','new_ask','review_request','published'));

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications(recipient_id, created_at DESC)
  WHERE read_at IS NULL;

-- 2. RLS — 본인 알림만 SELECT/UPDATE (Phase 9 묶음 인지)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = recipient_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = recipient_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = recipient_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. 헬퍼: auth.users.id (comments.author_id 등) → profiles.id
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_uid_to_profile_id(p_auth uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles
   WHERE id = p_auth OR auth_user_id = p_auth
   ORDER BY (id = p_auth) DESC NULLS LAST
   LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger: comments INSERT → comment / reply
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_comment_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_actor_profile uuid;
  v_parent_author uuid;
  v_parent_actor_profile uuid;
  v_actor_name text;
BEGIN
  -- visible 댓글만
  IF NEW.status <> 'visible' THEN RETURN NEW; END IF;

  -- 글 정보
  SELECT q.author_id, q.shortcode INTO v_qa_author, v_qa_short
    FROM public.qas q WHERE q.id = NEW.qa_id;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.author_id);
  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  IF NEW.parent_id IS NULL THEN
    -- 글 작성자에게 'comment' (단, 본인 글 본인 댓글은 skip)
    IF v_qa_author IS NOT NULL AND v_qa_author <> v_actor_profile THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, qa_id, comment_id, message, url)
      VALUES (
        v_qa_author,
        'comment',
        v_actor_profile,
        NEW.qa_id,
        NEW.id,
        v_actor_name || '님이 댓글을 남겼습니다',
        '/q/' || COALESCE(v_qa_short, NEW.qa_id::text) || '#c' || NEW.id
      );
    END IF;
  ELSE
    -- 답글 — 부모 댓글 작성자에게 'reply'
    SELECT public.auth_uid_to_profile_id(c.author_id) INTO v_parent_actor_profile
      FROM public.comments c WHERE c.id = NEW.parent_id;
    v_parent_author := v_parent_actor_profile;
    IF v_parent_author IS NOT NULL AND v_parent_author <> v_actor_profile THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, qa_id, comment_id, message, url)
      VALUES (
        v_parent_author,
        'reply',
        v_actor_profile,
        NEW.qa_id,
        NEW.id,
        v_actor_name || '님이 답글을 남겼습니다',
        '/q/' || COALESCE(v_qa_short, NEW.qa_id::text) || '#c' || NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_notification ON public.comments;
CREATE TRIGGER trg_comments_notification
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.on_comment_for_notification();

-- ─────────────────────────────────────────────────────────────
-- 5. Trigger: qa_likes INSERT → 'like' (24h debounce, 같은 qa+recipient)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_qa_like_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_actor_profile uuid;
  v_actor_name text;
BEGIN
  SELECT q.author_id, q.shortcode INTO v_qa_author, v_qa_short
    FROM public.qas q WHERE q.id = NEW.qa_id;
  IF v_qa_author IS NULL THEN RETURN NEW; END IF;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.user_id);
  IF v_actor_profile = v_qa_author THEN RETURN NEW; END IF;

  -- 24시간 내 같은 (recipient, qa, kind=like) 있으면 skip (스팸 방지)
  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.recipient_id = v_qa_author
       AND n.qa_id = NEW.qa_id
       AND n.kind = 'like'
       AND n.created_at >= now() - interval '24 hours'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, qa_id, message, url)
  VALUES (
    v_qa_author,
    'like',
    v_actor_profile,
    NEW.qa_id,
    v_actor_name || '님이 좋아합니다',
    '/q/' || COALESCE(v_qa_short, NEW.qa_id::text)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_likes_notification ON public.qa_likes;
CREATE TRIGGER trg_qa_likes_notification
AFTER INSERT ON public.qa_likes
FOR EACH ROW EXECUTE FUNCTION public.on_qa_like_for_notification();

-- ─────────────────────────────────────────────────────────────
-- 6. Trigger: qas INSERT (category='ask') → 모든 원장에게 'new_ask'
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_qa_ask_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF NEW.category <> 'ask' OR NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.author_id;

  -- 모든 doctor profile에게 발송 (본인 글은 본인에게 skip)
  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, qa_id, message, url)
  SELECT
    p.id,
    'new_ask',
    NEW.author_id,
    NEW.id,
    v_actor_name || '님이 궁금해요 글을 올렸습니다',
    '/q/' || COALESCE(NEW.shortcode, NEW.id::text)
   FROM public.profiles p
  WHERE p.role = 'doctor'
    AND p.id <> NEW.author_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_ask_notification ON public.qas;
CREATE TRIGGER trg_qa_ask_notification
AFTER INSERT ON public.qas
FOR EACH ROW EXECUTE FUNCTION public.on_qa_ask_for_notification();

-- ─────────────────────────────────────────────────────────────
-- 7. Trigger: qas UPDATE status='pending_review' → doctor에게 'review_request'
--           qas UPDATE status='published' (from pending_review) → author에게 'published'
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_qa_status_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doctor_profile uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'pending_review' AND NEW.doctor_id IS NOT NULL THEN
    SELECT da.profile_id INTO v_doctor_profile
      FROM public.doctor_accounts da WHERE da.doctor_id = NEW.doctor_id;
    IF v_doctor_profile IS NOT NULL THEN
      INSERT INTO public.notifications
        (recipient_id, kind, qa_id, message, url)
      VALUES (
        v_doctor_profile,
        'review_request',
        NEW.id,
        '새 카드 검수 요청이 도착했습니다',
        '/admin/qas/' || NEW.id::text || '/edit'
      );
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'pending_review'
     AND NEW.author_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (recipient_id, kind, qa_id, message, url)
    VALUES (
      NEW.author_id,
      'published',
      NEW.id,
      '카드가 발행되었습니다',
      '/q/' || COALESCE(NEW.shortcode, NEW.id::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_status_notification ON public.qas;
CREATE TRIGGER trg_qa_status_notification
AFTER UPDATE ON public.qas
FOR EACH ROW EXECUTE FUNCTION public.on_qa_status_for_notification();

-- ─────────────────────────────────────────────────────────────
-- 8. RPC: 미확인 알림 수 + 최근 N개
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 20)
RETURNS TABLE(
  id bigint,
  kind text,
  actor_id uuid,
  actor_name text,
  actor_handle text,
  qa_id bigint,
  comment_id bigint,
  message text,
  url text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
  )
  SELECT n.id, n.kind, n.actor_id, p.display_name AS actor_name,
         p.handle AS actor_handle, n.qa_id, n.comment_id,
         n.message, n.url, n.read_at, n.created_at
    FROM public.notifications n
    JOIN me ON me.id = n.recipient_id
    LEFT JOIN public.profiles p ON p.id = n.actor_id
   ORDER BY n.created_at DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_unread_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint
    FROM public.notifications n
   WHERE n.read_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = n.recipient_id
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
     );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_unread_count() TO authenticated;

-- 모두 읽음
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.notifications n
     SET read_at = now()
   WHERE n.read_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = n.recipient_id
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
     );
$$;

GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read() TO authenticated;

SELECT 'OK 0062' AS status;
