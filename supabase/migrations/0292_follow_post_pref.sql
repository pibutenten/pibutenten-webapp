-- 0292_follow_post_pref.sql
-- 팔로우 새글 알림 끄기 토글 (2026-06-27). 0290 follow_post 알림에 per-user on/off 추가.
--   1) notification_preferences.pref_follow_post (boolean, 기본 ON)
--   2) is_notification_enabled 에 follow_post 분기 추가
--   3) get_my_notification_prefs 9→10 컬럼(DROP+CREATE). 옛 코드(9컬럼 읽기)는 10번째 무시 → 무중단.
--   4) save_my_notification_prefs 10-인자 추가(기존 9-인자는 유지 → 배포 윈도우 없음. 신코드는 10-인자 사용).
--   5) 발행 트리거에 is_notification_enabled(follower,'follow_post') 게이트 추가(끈 사람은 알림 X).

BEGIN;

-- 1) pref 컬럼 (기본 ON — 팔로우=새글 알림이 기본, 끄려면 토글)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_follow_post boolean NOT NULL DEFAULT true;

-- 2) is_notification_enabled: follow_post 분기 추가 (나머지 VERBATIM)
CREATE OR REPLACE FUNCTION public.is_notification_enabled(p_profile uuid, p_kind text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE p_kind
      WHEN 'comment'         THEN np.pref_comment
      WHEN 'reply'           THEN np.pref_reply
      WHEN 'like'            THEN np.pref_like
      WHEN 'save'            THEN np.pref_save
      WHEN 'review_request'  THEN np.pref_review_request
      WHEN 'published'       THEN np.pref_published
      WHEN 'follow_post'     THEN np.pref_follow_post
      ELSE true
    END,
    true
  )
  FROM (SELECT 1) dummy
  LEFT JOIN public.notification_preferences np ON np.profile_id = p_profile;
$function$;

-- 3) get_my_notification_prefs 9→10 컬럼 (반환 타입 변경 → DROP+CREATE). 옛 코드는 10번째 무시.
DROP FUNCTION IF EXISTS public.get_my_notification_prefs();
CREATE FUNCTION public.get_my_notification_prefs()
 RETURNS TABLE(
   pref_comment boolean, pref_reply boolean, pref_like boolean, pref_save boolean,
   pref_review_request boolean, pref_published boolean,
   pref_keyword_interest boolean, pref_keyword_concern boolean, pref_keyword_skin_type boolean,
   pref_follow_post boolean
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT id FROM public.profiles WHERE id = auth.uid() OR auth_user_id = auth.uid() LIMIT 1
  )
  SELECT
    COALESCE(np.pref_comment, true),
    COALESCE(np.pref_reply, true),
    COALESCE(np.pref_like, true),
    COALESCE(np.pref_save, true),
    COALESCE(np.pref_review_request, true),
    COALESCE(np.pref_published, true),
    COALESCE(np.pref_keyword_interest, true),
    COALESCE(np.pref_keyword_concern, true),
    COALESCE(np.pref_keyword_skin_type, true),
    COALESCE(np.pref_follow_post, true)
  FROM me
  LEFT JOIN public.notification_preferences np ON np.profile_id = me.id;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_prefs() TO authenticated;

-- 4) save_my_notification_prefs 10-인자 추가 (기존 9-인자는 0244 그대로 유지 → 무중단 배포).
CREATE OR REPLACE FUNCTION public.save_my_notification_prefs(
  p_comment boolean, p_reply boolean, p_like boolean, p_save boolean,
  p_review_request boolean, p_published boolean,
  p_keyword_interest boolean, p_keyword_concern boolean, p_keyword_skin_type boolean,
  p_follow_post boolean
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_profile uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles
   WHERE id = auth.uid() OR auth_user_id = auth.uid() LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  INSERT INTO public.notification_preferences
    (profile_id, pref_comment, pref_reply, pref_like, pref_save, pref_review_request, pref_published,
     pref_keyword_interest, pref_keyword_concern, pref_keyword_skin_type, pref_follow_post, updated_at)
  VALUES (v_profile, p_comment, p_reply, p_like, p_save, p_review_request, p_published,
     p_keyword_interest, p_keyword_concern, p_keyword_skin_type, p_follow_post, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET pref_comment = excluded.pref_comment,
        pref_reply = excluded.pref_reply,
        pref_like = excluded.pref_like,
        pref_save = excluded.pref_save,
        pref_review_request = excluded.pref_review_request,
        pref_published = excluded.pref_published,
        pref_keyword_interest = excluded.pref_keyword_interest,
        pref_keyword_concern = excluded.pref_keyword_concern,
        pref_keyword_skin_type = excluded.pref_keyword_skin_type,
        pref_follow_post = excluded.pref_follow_post,
        updated_at = now();
END;
$function$;
GRANT EXECUTE ON FUNCTION public.save_my_notification_prefs(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;

-- 5) 발행 트리거에 follow_post 끔 게이트 추가 (0290 본문 + WHERE 마지막 한 줄). 나머지 동일.
CREATE OR REPLACE FUNCTION public.on_card_publish_for_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_author uuid; v_handle text; v_short text; v_title text; v_url text; v_author_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published'::qa_status) THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'published' OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  v_author := NEW.author_id;
  IF v_author IS NULL THEN RETURN NEW; END IF;

  SELECT p.handle, COALESCE(p.display_name, p.handle, '회원')
    INTO v_handle, v_author_name
    FROM public.profiles p WHERE p.id = v_author;
  v_short := NEW.shortcode;
  v_title := COALESCE(NULLIF(NEW.title, ''), '새 글');

  v_url := COALESCE(
    CASE WHEN NEW.doctor_id IS NOT NULL THEN (
      SELECT '/doctors/' || d.slug || '/' || NEW.post_year || '/' || NEW.post_slug
        FROM public.doctors d
       WHERE d.id = NEW.doctor_id AND NEW.post_year IS NOT NULL AND NEW.post_slug IS NOT NULL
    ) END,
    CASE WHEN v_handle IS NOT NULL AND v_short IS NOT NULL
         THEN '/' || v_handle || '/' || v_short END,
    '/'
  );

  INSERT INTO public.notifications (recipient_id, kind, actor_id, card_id, message, url)
  SELECT f.follower_id, 'follow_post', v_author, NEW.id,
         v_author_name || '님이 새 글을 올렸어요: ' || v_title, v_url
    FROM public.follows f
   WHERE f.followee_id = v_author
     AND f.follower_id <> v_author
     AND public.is_notification_enabled(f.follower_id, 'follow_post');

  RETURN NEW;
END;
$$;

COMMIT;

SELECT 'OK 0292' AS status;
