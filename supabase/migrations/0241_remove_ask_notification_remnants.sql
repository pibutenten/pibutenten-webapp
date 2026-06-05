-- 0241_remove_ask_notification_remnants.sql
-- 2026-06-06 — 옛 'ask/궁금해요' 알림 死 잔재 완전 제거 (4-2).
--
-- 배경(STEP A 진단 확정): ask 전용 알림은 永 死.
--   - on_card_ask_for_notification(cards INSERT)·on_ask_owner_self_reply(comments INSERT)
--     본문 첫 줄 IF NEW.category<>'ask' RETURN NEW. 'ask' 는 cards_category_check 미허용 + 0행
--     → 본문 도달 불가(영구 미발화).
--   - notifications.kind 'new_ask': 생산자 死, 과거 이력 36행만 잔존.
--   - UI(notification-kinds·필터·토글·push)·pref_new_ask 컬럼·is_notification_enabled 분기 잔존.
--
-- 디렉터 승인: 과거 new_ask 알림 36행도 함께 삭제(파괴적이나 대상 전부 死).
-- 옛 적용 마이그(0079/0080 등)는 수정하지 않음 — 본 신규 마이그로만 현행 객체 제거.
--
-- 동반 변경(불가피): pref_new_ask 를 참조하던 get_my_notification_prefs / save_my_notification_prefs
--   RPC 도 함께 갱신(컬럼 DROP 전 참조 끊기). save_* 는 인자 1개 감소·get_* 는 RETURNS TABLE 변경이라
--   DROP + CREATE(시그니처/반환 변경은 CREATE OR REPLACE 불가). ACL=authenticated EXECUTE 재부여.

BEGIN;

-- 1) 옛 new_ask 알림 행 삭제 (생산자 死, 이력만 잔존)
DELETE FROM public.notifications WHERE kind = 'new_ask';

-- 2) 死 트리거 + 함수 제거 (트리거 → 함수 순)
DROP TRIGGER IF EXISTS trg_card_ask_notification ON public.cards;
DROP FUNCTION IF EXISTS public.on_card_ask_for_notification();
DROP TRIGGER IF EXISTS trg_ask_owner_self_reply ON public.comments;
DROP FUNCTION IF EXISTS public.on_ask_owner_self_reply();

-- 3) is_notification_enabled — 'new_ask' 분기만 제거 (나머지 분기·시그니처·동작 VERBATIM)
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
      WHEN 'review_request'  THEN np.pref_review_request
      WHEN 'published'       THEN np.pref_published
      ELSE true
    END,
    true  -- preferences row 없으면 default true
  )
  FROM (SELECT 1) dummy
  LEFT JOIN public.notification_preferences np ON np.profile_id = p_profile;
$function$;

-- 3.5) prefs RPC 에서 new_ask 제거 (DROP COLUMN 전 컬럼 참조 끊기)
DROP FUNCTION IF EXISTS public.get_my_notification_prefs();
CREATE FUNCTION public.get_my_notification_prefs()
 RETURNS TABLE(pref_comment boolean, pref_reply boolean, pref_like boolean, pref_review_request boolean, pref_published boolean)
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
    COALESCE(np.pref_review_request, true),
    COALESCE(np.pref_published, true)
  FROM me
  LEFT JOIN public.notification_preferences np ON np.profile_id = me.id;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_notification_prefs() TO authenticated;

DROP FUNCTION IF EXISTS public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean);
CREATE FUNCTION public.save_my_notification_prefs(p_comment boolean, p_reply boolean, p_like boolean, p_review_request boolean, p_published boolean)
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
    (profile_id, pref_comment, pref_reply, pref_like, pref_review_request, pref_published, updated_at)
  VALUES (v_profile, p_comment, p_reply, p_like, p_review_request, p_published, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET pref_comment = excluded.pref_comment,
        pref_reply = excluded.pref_reply,
        pref_like = excluded.pref_like,
        pref_review_request = excluded.pref_review_request,
        pref_published = excluded.pref_published,
        updated_at = now();
END;
$function$;
GRANT EXECUTE ON FUNCTION public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean) TO authenticated;

-- 4) pref_new_ask 컬럼 제거 (위 3·3.5 로 참조 모두 끊긴 후)
ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS pref_new_ask;

-- 5) notifications_kind_check — 'new_ask' 제외 6종 재생성 (report(0239) 보존)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment'::text, 'reply'::text, 'like'::text,
    'review_request'::text, 'published'::text, 'report'::text
  ]));

COMMIT;

SELECT 'OK 0241' AS status;
