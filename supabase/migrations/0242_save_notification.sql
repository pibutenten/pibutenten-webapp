-- 0242_save_notification.sql
-- 2026-06-06 — 저장 알림 신설 (4-2). 누군가 내 글을 저장하면 작성자에게 알림(이름 비노출, 숫자만).
--
-- 설계: 좋아요 알림(on_card_like_for_notification, 0083)의 24h 묶음 패턴을 그대로 본뜨되
--   표시는 숫자만. actor_id=NULL(이름 절대 비노출), message=누적 save_count 사용.
--
-- 구성:
--   1) notification_preferences.pref_save 컬럼(default true)
--   2) is_notification_enabled 에 'save'→pref_save 분기 추가
--   3) get/save_my_notification_prefs 5→6 컬럼/인자(p_save 추가)
--   4) notifications_kind_check 6종→7종('save' 추가, 기존 6종 보존)
--   5) card_saves AFTER INSERT 트리거 + 함수(SECURITY DEFINER, 24h 묶음, EXCEPTION 격리)
--
-- 트리거 순서: 기존 trg_card_saves_count(AFTER, save_count +1) → trg_card_saves_notification.
--   알파벳순('count' < 'notification') 으로 count 가 먼저 실행 → 알림 함수가 갱신된 save_count 를 읽음.

BEGIN;

-- 1) pref_save 컬럼
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_save boolean NOT NULL DEFAULT true;

-- 2) is_notification_enabled — 'save' 분기 추가 (나머지 VERBATIM)
CREATE OR REPLACE FUNCTION public.is_notification_enabled(p_profile uuid, p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE p_kind
      WHEN 'comment'         THEN np.pref_comment
      WHEN 'reply'           THEN np.pref_reply
      WHEN 'like'            THEN np.pref_like
      WHEN 'save'            THEN np.pref_save
      WHEN 'review_request'  THEN np.pref_review_request
      WHEN 'published'       THEN np.pref_published
      ELSE true
    END,
    true
  )
  FROM (SELECT 1) dummy
  LEFT JOIN public.notification_preferences np ON np.profile_id = p_profile;
$function$;

-- 3) prefs RPC 6 컬럼/인자 (p_save 추가)
DROP FUNCTION IF EXISTS public.get_my_notification_prefs();
CREATE FUNCTION public.get_my_notification_prefs()
 RETURNS TABLE(pref_comment boolean, pref_reply boolean, pref_like boolean, pref_save boolean, pref_review_request boolean, pref_published boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR auth_user_id = auth.uid()
     LIMIT 1
  )
  SELECT
    COALESCE(np.pref_comment, true),
    COALESCE(np.pref_reply, true),
    COALESCE(np.pref_like, true),
    COALESCE(np.pref_save, true),
    COALESCE(np.pref_review_request, true),
    COALESCE(np.pref_published, true)
  FROM me
  LEFT JOIN public.notification_preferences np ON np.profile_id = me.id;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_prefs() TO authenticated;

DROP FUNCTION IF EXISTS public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean);
CREATE FUNCTION public.save_my_notification_prefs(p_comment boolean, p_reply boolean, p_like boolean, p_save boolean, p_review_request boolean, p_published boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (profile_id, pref_comment, pref_reply, pref_like, pref_save, pref_review_request, pref_published, updated_at)
  VALUES (v_profile, p_comment, p_reply, p_like, p_save, p_review_request, p_published, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET pref_comment = excluded.pref_comment,
        pref_reply = excluded.pref_reply,
        pref_like = excluded.pref_like,
        pref_save = excluded.pref_save,
        pref_review_request = excluded.pref_review_request,
        pref_published = excluded.pref_published,
        updated_at = now();
END;
$function$;
GRANT EXECUTE ON FUNCTION public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;

-- 4) notifications_kind_check 6종 → 7종 ('save' 추가)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment'::text, 'reply'::text, 'like'::text, 'save'::text,
    'review_request'::text, 'published'::text, 'report'::text
  ]));

-- 5) 저장 알림 함수 + 트리거 (좋아요 0083 24h 묶음 패턴, 표시는 숫자만)
CREATE OR REPLACE FUNCTION public.on_card_save_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card_author uuid;
  v_card_short  text;
  v_save_count  int;
  v_actor_profile uuid;
  v_existing_id bigint;
  v_message text;
  v_url text;
BEGIN
  -- best-effort: 알림 실패가 저장(card_saves INSERT) 트랜잭션을 롤백시키지 않게 격리.
  BEGIN
    SELECT c.author_id, c.shortcode, COALESCE(c.save_count, 0)
      INTO v_card_author, v_card_short, v_save_count
      FROM public.cards c WHERE c.id = NEW.card_id;
    IF v_card_author IS NULL THEN RETURN NEW; END IF;

    -- 저장자 본인 = 작성자면 skip (자기 글 저장은 알림 없음)
    v_actor_profile := public.auth_uid_to_profile_id(NEW.profile_id);
    IF v_actor_profile = v_card_author THEN RETURN NEW; END IF;

    IF NOT public.is_notification_enabled(v_card_author, 'save') THEN RETURN NEW; END IF;

    -- 이름 비노출 — actor_id NULL, 누적 save_count 로 숫자만 표시.
    v_message := '회원님 글을 ' || v_save_count::text || '명이 저장했어요';
    v_url := COALESCE(
      (SELECT '/' || p.handle || '/' || v_card_short
         FROM public.profiles p WHERE p.id = v_card_author),
      '/'
    );

    -- 24h 묶음: 기존 'save' 알림 있으면 UPDATE(카운트 갱신 + 재노출), 없으면 INSERT.
    SELECT id INTO v_existing_id
      FROM public.notifications
     WHERE recipient_id = v_card_author
       AND card_id = NEW.card_id
       AND kind = 'save'
       AND created_at >= now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.notifications
         SET message = v_message,
             actor_id = NULL,
             created_at = now(),
             read_at = NULL
       WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, card_id, message, url)
      VALUES (v_card_author, 'save', NULL, NEW.card_id, v_message, v_url);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[save_notification] failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_card_saves_notification ON public.card_saves;
CREATE TRIGGER trg_card_saves_notification
AFTER INSERT ON public.card_saves
FOR EACH ROW EXECUTE FUNCTION public.on_card_save_for_notification();

COMMIT;

SELECT 'OK 0242' AS status;
