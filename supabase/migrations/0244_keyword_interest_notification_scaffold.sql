-- 0244_keyword_interest_notification_scaffold.sql
-- 2026-06-06 — 관심(Q&A) 알림 토대 (4-2 / 3b-1).
--
-- 배경:
--   관심 알림 = "회원의 관심사·피부고민·피부타입 태그에 맞는 새 Q&A 를 하루 한 번 주제별로 알림 +
--   /search?q={태그} 이동". 본 단계(3b-1)는 그 *토대*(색인·토글·종류)만 만든다.
--   실제 발생(digest + cron)은 3b-2 — 이번엔 **생산자 없음 = 알림 0건**(순수 additive·무위험).
--
-- 변경:
--   1) GIN 인덱스 2개: profiles.interested_procedures / profiles.skin_concerns (cards.keywords GIN 은 기존 존재).
--   2) notification_preferences 신규 pref 3컬럼(boolean NOT NULL DEFAULT true).
--   3) notifications_kind_check 7종→8종: 'keyword' 추가(기존 7종 전부 보존).
--   4) prefs RPC 확장: get_my_notification_prefs 6→9 컬럼, save_my_notification_prefs 6→9 인자.
--      나머지 본문 VERBATIM. 시그니처 변경(반환 컬럼/인자 수)이라 DROP+CREATE, authenticated GRANT 재부여.
--   5) is_notification_enabled 는 'keyword' 분기 **추가하지 않음** — 관심 알림은 3개 토글을
--      dimension(피부타입/피부고민/관심사) 별로 따져야 해 단일 bool 게이트가 맞지 않음.
--      게이팅은 3b-2 digest 가 pref 3컬럼을 직접 읽어 처리. 현 ELSE true 그대로 둠(미수정).

BEGIN;

-- 1) GIN 인덱스 2개 (배열 컬럼 → digest 의 태그 overlap 검색 대비). 멱등(IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS profiles_interested_procedures_gin_idx
  ON public.profiles USING gin (interested_procedures);
CREATE INDEX IF NOT EXISTS profiles_skin_concerns_gin_idx
  ON public.profiles USING gin (skin_concerns);

-- 2) 신규 pref 3컬럼 (피부타입/피부고민/관심사). 기본 ON.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS pref_keyword_interest  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_keyword_concern   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_keyword_skin_type boolean NOT NULL DEFAULT true;

-- 3) kind_check 7종 → 8종 ('keyword' 추가, 기존 7종 보존).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment'::text, 'reply'::text, 'like'::text, 'save'::text,
    'review_request'::text, 'published'::text, 'report'::text, 'keyword'::text
  ]));

-- 4a) get_my_notification_prefs 6→9 컬럼 (DROP+CREATE: 반환 타입 변경).
DROP FUNCTION IF EXISTS public.get_my_notification_prefs();

CREATE FUNCTION public.get_my_notification_prefs()
 RETURNS TABLE(
   pref_comment boolean, pref_reply boolean, pref_like boolean, pref_save boolean,
   pref_review_request boolean, pref_published boolean,
   pref_keyword_interest boolean, pref_keyword_concern boolean, pref_keyword_skin_type boolean
 )
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
    COALESCE(np.pref_published, true),
    COALESCE(np.pref_keyword_interest, true),
    COALESCE(np.pref_keyword_concern, true),
    COALESCE(np.pref_keyword_skin_type, true)
  FROM me
  LEFT JOIN public.notification_preferences np ON np.profile_id = me.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_notification_prefs() TO authenticated;

-- 4b) save_my_notification_prefs 6→9 인자 (DROP+CREATE: 시그니처 변경).
DROP FUNCTION IF EXISTS public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean);

CREATE FUNCTION public.save_my_notification_prefs(
  p_comment boolean, p_reply boolean, p_like boolean, p_save boolean,
  p_review_request boolean, p_published boolean,
  p_keyword_interest boolean, p_keyword_concern boolean, p_keyword_skin_type boolean
)
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
    (profile_id, pref_comment, pref_reply, pref_like, pref_save, pref_review_request, pref_published,
     pref_keyword_interest, pref_keyword_concern, pref_keyword_skin_type, updated_at)
  VALUES (v_profile, p_comment, p_reply, p_like, p_save, p_review_request, p_published,
     p_keyword_interest, p_keyword_concern, p_keyword_skin_type, now())
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
        updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_my_notification_prefs(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;

COMMIT;

SELECT 'OK 0244' AS status;
