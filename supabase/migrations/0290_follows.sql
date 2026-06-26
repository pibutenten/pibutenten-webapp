-- 0290_follows.sql
-- 팔로우/구독 (2026-06-27) — 원장·회원 상호 팔로우. 명함(profile.id) 단위(ADR 0012).
--   1) follows 테이블 + RLS(공개 SELECT, 쓰기는 RPC 경유만)
--   2) toggle_follow RPC (toggle_card_save 0162:269 동형 — 묶음검증 + active fallback + 자기팔로우 차단)
--   3) get_my_follow RPC (프로필 버튼용: 내 팔로우 여부 + 팔로워 수)
--   4) notifications kind 8종 → 9종 ('follow_post' 추가, notification-kinds.ts 동시 갱신 필요)
--   5) 발행 트리거: 팔로우 대상이 새 글 발행 시 follower 들에게 'follow_post' 알림 개별 INSERT
--      (자기자신 skip. 묶음 UPDATE 금지 — push webhook 0086 이 AFTER INSERT 만이라 묶으면 푸시 누락).
--   ※ 베타 팔로워 소수라 fan-out 무위험. 대규모는 digest 후속 안건(스팸 주의).

BEGIN;

-- 1) follows 테이블 ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows(followee_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
-- 공개 SELECT (팔로워 수·관계는 공개 소셜그래프). 쓰기 정책 없음 → 직접 INSERT/DELETE 차단,
--   SECURITY DEFINER RPC(toggle_follow)만 기록.
DROP POLICY IF EXISTS follows_select_public ON public.follows;
CREATE POLICY follows_select_public ON public.follows FOR SELECT USING (true);

-- 2) toggle_follow RPC --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_follow(p_followee_id uuid, p_identity_id uuid DEFAULT NULL::uuid)
  RETURNS TABLE(following boolean, follower_count integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_auth uuid; v_follower uuid; v_following boolean; v_count int;
BEGIN
  v_auth := auth.uid();
  IF v_auth IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- active 명함 결정 (toggle_card_save 동형): p_identity_id 가 본인 묶음이면 사용, 아니면 active fallback.
  IF p_identity_id IS NOT NULL THEN
    SELECT p.id INTO v_follower FROM public.profiles p
     WHERE p.id = p_identity_id AND (p.id = v_auth OR p.auth_user_id = v_auth) LIMIT 1;
    IF v_follower IS NULL THEN
      v_follower := COALESCE(public.current_active_profile_id(), v_auth);
    END IF;
  ELSE
    v_follower := COALESCE(public.current_active_profile_id(), v_auth);
  END IF;

  IF v_follower = p_followee_id THEN
    RAISE EXCEPTION 'cannot follow self';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_followee_id) THEN
    RAISE EXCEPTION 'followee not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.follows WHERE follower_id = v_follower AND followee_id = p_followee_id) THEN
    DELETE FROM public.follows WHERE follower_id = v_follower AND followee_id = p_followee_id;
    v_following := false;
  ELSE
    INSERT INTO public.follows (follower_id, followee_id) VALUES (v_follower, p_followee_id)
      ON CONFLICT DO NOTHING;
    v_following := true;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.follows WHERE followee_id = p_followee_id;
  RETURN QUERY SELECT v_following, COALESCE(v_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_follow(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid, uuid) TO authenticated;

-- 3) get_my_follow RPC (프로필 버튼 초기 상태) --------------------------------
--   비로그인(anon)은 following=false + 공개 팔로워 수만. GRANT anon,authenticated.
CREATE OR REPLACE FUNCTION public.get_my_follow(p_followee_id uuid)
  RETURNS TABLE(following boolean, follower_count integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.follows f
       WHERE f.followee_id = p_followee_id
         AND f.follower_id = COALESCE(public.current_active_profile_id(), auth.uid())
    ),
    (SELECT count(*)::int FROM public.follows WHERE followee_id = p_followee_id);
$$;
REVOKE ALL ON FUNCTION public.get_my_follow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_follow(uuid) TO anon, authenticated;

-- 4) notifications kind 8 → 9 ('follow_post') --------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'comment'::text, 'reply'::text, 'like'::text, 'save'::text,
    'review_request'::text, 'published'::text, 'report'::text, 'keyword'::text,
    'follow_post'::text
  ]));

-- 5) 발행 → 팔로워 알림 트리거 ------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_card_publish_for_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_author uuid; v_handle text; v_short text; v_title text; v_url text; v_author_name text;
BEGIN
  -- 발행 진입만: UPDATE 는 published 로 '전환'된 경우만(이미 published 재저장 제외).
  --   OLD.status 는 enum(qa_status) — IS DISTINCT FROM 으로 NULL 안전 비교(빈문자열 cast 금지).
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

  -- URL: 의사글 /doctors/{slug}/{year}/{post_slug}, 회원글 /{handle}/{shortcode}, 그 외 '/'.
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

  -- author 를 팔로우하는 follower 들에게 개별 INSERT (자기자신 제외).
  INSERT INTO public.notifications (recipient_id, kind, actor_id, card_id, message, url)
  SELECT f.follower_id, 'follow_post', v_author, NEW.id,
         v_author_name || '님이 새 글을 올렸어요: ' || v_title, v_url
    FROM public.follows f
   WHERE f.followee_id = v_author
     AND f.follower_id <> v_author;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_publish_followers_ins ON public.cards;
CREATE TRIGGER trg_card_publish_followers_ins
  AFTER INSERT ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.on_card_publish_for_followers();

DROP TRIGGER IF EXISTS trg_card_publish_followers_upd ON public.cards;
CREATE TRIGGER trg_card_publish_followers_upd
  AFTER UPDATE OF status ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.on_card_publish_for_followers();

COMMIT;

SELECT 'OK 0290' AS status;
