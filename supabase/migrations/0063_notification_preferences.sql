-- 0063: 알림 종류별 on/off 설정 + 트리거에 적용
--
-- 각 사용자(profile)는 6종 알림 각각 on/off 가능. default true.
-- 트리거 INSERT 전에 preferences 검사 → off면 skip.

-- 1. 테이블
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pref_comment boolean NOT NULL DEFAULT true,
  pref_reply boolean NOT NULL DEFAULT true,
  pref_like boolean NOT NULL DEFAULT true,
  pref_new_ask boolean NOT NULL DEFAULT true,
  pref_review_request boolean NOT NULL DEFAULT true,
  pref_published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS — 본인 prefs만 (Phase 9 묶음 인지)
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_select_own ON public.notification_preferences;
CREATE POLICY np_select_own ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS np_upsert_own ON public.notification_preferences;
CREATE POLICY np_upsert_own ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;

-- 3. 헬퍼: 특정 (profile_id, kind) 알림 허용 여부
CREATE OR REPLACE FUNCTION public.is_notification_enabled(
  p_profile uuid, p_kind text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    CASE p_kind
      WHEN 'comment'         THEN np.pref_comment
      WHEN 'reply'           THEN np.pref_reply
      WHEN 'like'            THEN np.pref_like
      WHEN 'new_ask'         THEN np.pref_new_ask
      WHEN 'review_request'  THEN np.pref_review_request
      WHEN 'published'       THEN np.pref_published
      ELSE true
    END,
    true  -- preferences row 없으면 default true
  )
  FROM (SELECT 1) dummy
  LEFT JOIN public.notification_preferences np ON np.profile_id = p_profile;
$$;

GRANT EXECUTE ON FUNCTION public.is_notification_enabled(uuid, text) TO authenticated;

-- 4. 트리거 재정의 — preferences 검사 후 INSERT

-- comments → comment / reply
CREATE OR REPLACE FUNCTION public.on_comment_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_actor_profile uuid;
  v_parent_author uuid;
  v_actor_name text;
BEGIN
  IF NEW.status <> 'visible' THEN RETURN NEW; END IF;

  SELECT q.author_id, q.shortcode INTO v_qa_author, v_qa_short
    FROM public.qas q WHERE q.id = NEW.qa_id;
  v_actor_profile := public.auth_uid_to_profile_id(NEW.author_id);
  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  IF NEW.parent_id IS NULL THEN
    IF v_qa_author IS NOT NULL AND v_qa_author <> v_actor_profile
       AND public.is_notification_enabled(v_qa_author, 'comment') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, qa_id, comment_id, message, url)
      VALUES (
        v_qa_author, 'comment', v_actor_profile, NEW.qa_id, NEW.id,
        v_actor_name || '님이 댓글을 남겼습니다',
        '/q/' || COALESCE(v_qa_short, NEW.qa_id::text) || '#c' || NEW.id
      );
    END IF;
  ELSE
    SELECT public.auth_uid_to_profile_id(c.author_id) INTO v_parent_author
      FROM public.comments c WHERE c.id = NEW.parent_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> v_actor_profile
       AND public.is_notification_enabled(v_parent_author, 'reply') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, qa_id, comment_id, message, url)
      VALUES (
        v_parent_author, 'reply', v_actor_profile, NEW.qa_id, NEW.id,
        v_actor_name || '님이 답글을 남겼습니다',
        '/q/' || COALESCE(v_qa_short, NEW.qa_id::text) || '#c' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- qa_likes → like
CREATE OR REPLACE FUNCTION public.on_qa_like_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF NOT public.is_notification_enabled(v_qa_author, 'like') THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.recipient_id = v_qa_author AND n.qa_id = NEW.qa_id AND n.kind = 'like'
       AND n.created_at >= now() - interval '24 hours'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;
  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, qa_id, message, url)
  VALUES (
    v_qa_author, 'like', v_actor_profile, NEW.qa_id,
    v_actor_name || '님이 좋아합니다',
    '/q/' || COALESCE(v_qa_short, NEW.qa_id::text)
  );
  RETURN NEW;
END;
$$;

-- qas INSERT (category='ask') → new_ask (모든 원장, 각자 prefs 검사)
CREATE OR REPLACE FUNCTION public.on_qa_ask_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF NEW.category <> 'ask' OR NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = NEW.author_id;

  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, qa_id, message, url)
  SELECT
    p.id, 'new_ask', NEW.author_id, NEW.id,
    v_actor_name || '님이 궁금해요 글을 올렸습니다',
    '/q/' || COALESCE(NEW.shortcode, NEW.id::text)
   FROM public.profiles p
  WHERE p.role = 'doctor'
    AND p.id <> NEW.author_id
    AND public.is_notification_enabled(p.id, 'new_ask');
  RETURN NEW;
END;
$$;

-- qas UPDATE status → review_request / published
CREATE OR REPLACE FUNCTION public.on_qa_status_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_doctor_profile uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'pending_review' AND NEW.doctor_id IS NOT NULL THEN
    SELECT da.profile_id INTO v_doctor_profile
      FROM public.doctor_accounts da WHERE da.doctor_id = NEW.doctor_id;
    IF v_doctor_profile IS NOT NULL
       AND public.is_notification_enabled(v_doctor_profile, 'review_request') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, qa_id, message, url)
      VALUES (
        v_doctor_profile, 'review_request', NEW.id,
        '새 카드 검수 요청이 도착했습니다',
        '/admin/qas/' || NEW.id::text || '/edit'
      );
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'pending_review'
     AND NEW.author_id IS NOT NULL
     AND public.is_notification_enabled(NEW.author_id, 'published') THEN
    INSERT INTO public.notifications
      (recipient_id, kind, qa_id, message, url)
    VALUES (
      NEW.author_id, 'published', NEW.id,
      '카드가 발행되었습니다',
      '/q/' || COALESCE(NEW.shortcode, NEW.id::text)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 5. RPC: 본인 prefs 조회 (없으면 default true 반환)
CREATE OR REPLACE FUNCTION public.get_my_notification_prefs()
RETURNS TABLE(
  pref_comment boolean,
  pref_reply boolean,
  pref_like boolean,
  pref_new_ask boolean,
  pref_review_request boolean,
  pref_published boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
     LIMIT 1
  )
  SELECT
    COALESCE(np.pref_comment, true),
    COALESCE(np.pref_reply, true),
    COALESCE(np.pref_like, true),
    COALESCE(np.pref_new_ask, true),
    COALESCE(np.pref_review_request, true),
    COALESCE(np.pref_published, true)
  FROM me
  LEFT JOIN public.notification_preferences np ON np.profile_id = me.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_notification_prefs() TO authenticated;

-- 6. RPC: 본인 prefs 저장 (upsert)
CREATE OR REPLACE FUNCTION public.save_my_notification_prefs(
  p_comment boolean,
  p_reply boolean,
  p_like boolean,
  p_new_ask boolean,
  p_review_request boolean,
  p_published boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_profile uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles
   WHERE id = auth.uid() OR auth_user_id = auth.uid()
   LIMIT 1;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  INSERT INTO public.notification_preferences
    (profile_id, pref_comment, pref_reply, pref_like, pref_new_ask, pref_review_request, pref_published, updated_at)
  VALUES (v_profile, p_comment, p_reply, p_like, p_new_ask, p_review_request, p_published, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET pref_comment = excluded.pref_comment,
        pref_reply = excluded.pref_reply,
        pref_like = excluded.pref_like,
        pref_new_ask = excluded.pref_new_ask,
        pref_review_request = excluded.pref_review_request,
        pref_published = excluded.pref_published,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_notification_prefs(boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;

SELECT 'OK 0063' AS status;
