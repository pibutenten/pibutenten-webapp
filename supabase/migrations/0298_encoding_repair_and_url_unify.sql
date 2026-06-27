-- 0298_encoding_repair_and_url_unify.sql
-- 2026-06-27. (A) 과거 적용에서 깨진 한국어(U+FFFD) 11함수+테이블코멘트3+알림15행 정본 복원.
--   migration 소스는 클린이었고 적용경로(CP949)만 오염 → UTF-8 안전경로(node fetch)로 재적용.
-- (B) #1 알림 URL 통일: 신규 card_public_url(getQaUrl SSOT 미러)로 like/save/status/comment 트리거가
--   의사글도 canonical /doctors/{slug}/{year}/{slug} 저장(기존 /{handle}/{shortcode} 비-canonical 교정).
-- 적용 후 U+FFFD 전수 재스캔 0 확인 필수.

BEGIN;

-- (1) 카드 공개 URL 헬퍼 (#1 SSOT)
-- card_public_url: 카드 공개 URL SSOT (TS getQaUrl 미러). canonical 없으면 NULL → 호출측 fallback.
CREATE OR REPLACE FUNCTION public.card_public_url(p_card_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $func$
  SELECT COALESCE(
    CASE WHEN c.type = 'review_summary' AND c.post_slug IS NOT NULL
         THEN '/reports/' || c.post_slug END,
    CASE WHEN c.doctor_id IS NOT NULL AND c.post_year IS NOT NULL AND c.post_slug IS NOT NULL
         THEN '/doctors/' || d.slug || '/' || c.post_year::text || '/' || c.post_slug END,
    CASE WHEN p.handle IS NOT NULL AND c.shortcode IS NOT NULL
         THEN '/' || p.handle || '/' || c.shortcode END
  )
  FROM public.cards c
  LEFT JOIN public.doctors d ON d.id = c.doctor_id
  LEFT JOIN public.profiles p ON p.id = c.author_id
  WHERE c.id = p_card_id;
$func$;
GRANT EXECUTE ON FUNCTION public.card_public_url(bigint) TO authenticated, anon;

-- (2) 한국어 인코딩 교정 + #1 URL 통일 함수 13종
-- ── check_handle_not_reserved ──
CREATE OR REPLACE FUNCTION public.check_handle_not_reserved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- service role / postgres 호출은 모든 검사 bypass
  IF current_user = 'postgres' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.handle IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reserved_handles WHERE handle = NEW.handle
  ) THEN
    RAISE EXCEPTION '예약된 핸들입니다: %', NEW.handle;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── current_doctor_id ──
CREATE OR REPLACE FUNCTION public.current_doctor_id(uid uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 0176: profiles.doctor_id 인라인 컬럼이 SSOT (ADR 0012). doctor_accounts JOIN 폐기.
  SELECT p.doctor_id
  FROM public.profiles p
  WHERE p.id = COALESCE(public.current_active_profile_id(), uid)
    AND (p.id = uid OR p.auth_user_id = uid)
  LIMIT 1;
$function$;

-- ── get_notifications ──
CREATE OR REPLACE FUNCTION public.get_notifications(p_active_profile_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 30)
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

-- ── get_top_cards_by_comments_inner ──
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments_inner(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  cnt bigint, deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0 THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval END AS since
  ),
  agg AS (
    SELECT cm.card_id, COUNT(*)::bigint AS c
      FROM public.comments cm, bounds b
     WHERE cm.created_at >= b.since AND cm.status = 'visible'
     GROUP BY cm.card_id
  )
  SELECT c.id AS card_id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         a.c AS cnt, c.deleted_at
    FROM agg a JOIN public.cards c ON c.id = a.card_id
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE -- 0175: c.deleted_at IS NULL 제거 (KPI 정합). UI 가 deleted_at 으로 배지.
     (
       (p_doctor_id IS NULL AND p_author_profile_id IS NULL)
       OR c.doctor_id = p_doctor_id
       OR c.author_id = p_author_profile_id
     )
   ORDER BY a.c DESC, c.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$;

-- ── get_top_cards_by_views ──
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL, p_author_profile_id uuid DEFAULT NULL)
RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- 사이트 전체(both NULL)는 공개 통계 → 게이트 없음. 필터 경로만 권한 체크.
  IF NOT (p_doctor_id IS NULL AND p_author_profile_id IS NULL) THEN
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_views_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;

-- ── get_top_new_cards_inner ──
CREATE OR REPLACE FUNCTION public.get_top_new_cards_inner(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid, author_name text, author_handle text, created_at timestamp with time zone, deleted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT CASE WHEN p_days IS NULL OR p_days = 0
                THEN '1970-01-01'::timestamptz
                ELSE now() - (p_days || ' days')::interval
           END AS since
  )
  SELECT c.id, c.title, c.shortcode, c.author_id,
         p.display_name AS author_name, p.handle AS author_handle,
         c.created_at, c.deleted_at
    FROM public.cards c
    CROSS JOIN bounds b
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.created_at >= b.since
     AND c.status = 'published'
     -- 0175: c.deleted_at IS NULL 제거. status='published' 는 유지 (draft/pending 은 별도 메뉴).
   ORDER BY c.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$function$;

-- ── link_doctor_to_profile ──
CREATE OR REPLACE FUNCTION public.link_doctor_to_profile(
  p_profile_id uuid, p_doctor_slug text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_doctor_name text;
  v_identity_id uuid;
  v_caller_role text;
BEGIN
  SELECT role::text INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id, name INTO v_doctor_id, v_doctor_name FROM doctors WHERE slug = p_doctor_slug;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'doctor slug not found: %', p_doctor_slug;
  END IF;

  -- 0176: doctor_accounts INSERT 폐기. SSOT 인 profiles.doctor_id 를 직접 set.
  --   이미 다른 doctor 매핑이 있는 profile 이면 덮어쓰기 (옛 ON CONFLICT DO NOTHING 과 의미 다름).
  --   admin only 호출이므로 의도적 변경. 옛 매핑 이력이 필요하면 doctor_accounts_deprecated 조회.
  UPDATE profiles SET doctor_id = v_doctor_id WHERE id = p_profile_id;

  -- profile_identities 는 별도 SSOT 가 있으므로 그대로 유지 (옛 의미 보존).
  INSERT INTO profile_identities (profile_id, handle, display_name, kind, doctor_id)
  VALUES (p_profile_id, p_doctor_slug, v_doctor_name, 'doctor', v_doctor_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_identity_id;
  IF v_identity_id IS NULL THEN
    SELECT id INTO v_identity_id
      FROM profile_identities
      WHERE profile_id = p_profile_id
        AND kind = 'doctor'
        AND doctor_id = v_doctor_id;
  END IF;
  RETURN v_identity_id;
END;
$function$;

-- ── unlink_doctor_from_profile ──
CREATE OR REPLACE FUNCTION public.unlink_doctor_from_profile(p_profile_id uuid, p_doctor_slug text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_caller_role text;
  v_deleted int;
BEGIN
  SELECT role::text INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role <> 'admin' THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT id INTO v_doctor_id FROM doctors WHERE slug = p_doctor_slug;

  -- 0176: doctor_accounts DELETE 폐기. SSOT 인 profiles.doctor_id 를 NULL 로.
  --   해당 doctor 와 매핑된 profile 만 해제 (다른 doctor 매핑은 보존). 옛과 의미 동일.
  UPDATE profiles SET doctor_id = NULL
    WHERE id = p_profile_id AND doctor_id = v_doctor_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM profile_identities
    WHERE profile_id = p_profile_id
      AND kind = 'doctor'
      AND doctor_id = v_doctor_id;
  RETURN v_deleted;
END;
$function$;

-- ── on_content_report_for_notification ──
CREATE OR REPLACE FUNCTION public.on_content_report_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- best-effort: 알림 fan-out 실패가 신고 접수를 롤백시키지 않게 격리.
  BEGIN
    INSERT INTO public.notifications
      (recipient_id, kind, actor_id, card_id, comment_id, message, url)
    SELECT
      p.id,
      'report',
      NEW.reporter_profile_id,
      NEW.card_id,
      NEW.comment_id,
      '새 신고가 접수되었습니다',
      '/admin/reports'
    FROM public.profiles p
    WHERE p.role = 'admin'
      -- 신고자가 관리자면 본인은 제외.
      AND (NEW.reporter_profile_id IS NULL OR p.id <> NEW.reporter_profile_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[report_notification] fan-out insert failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- ── on_card_save_for_notification ──
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
    v_url := COALESCE(public.card_public_url(NEW.card_id), '/');

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

-- ── on_card_status_for_notification ──
CREATE OR REPLACE FUNCTION public.on_card_status_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_profile uuid;
  v_author_handle text;
  v_url text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'pending_review' AND NEW.doctor_id IS NOT NULL THEN
    -- 0176: doctor_accounts → profiles.doctor_id (SSOT). 같은 doctor 의 첫 profile 매칭.
    --   ADR 0012 정합: 같은 doctor 에 매핑된 profile 이 여러 개 있을 수 있으나, 알림은
    --   1건만 보냄 (LIMIT 1). 향후 active profile 매칭 정책 변경 시 본 함수 갱신.
    SELECT p.id INTO v_doctor_profile
      FROM public.profiles p
      WHERE p.doctor_id = NEW.doctor_id
      LIMIT 1;
    IF v_doctor_profile IS NOT NULL
       AND public.is_notification_enabled(v_doctor_profile, 'review_request') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, card_id, message, url)
      VALUES (
        v_doctor_profile, 'review_request', NEW.id,
        '새 카드 검수 요청이 도착했습니다',
        '/admin/cards/' || NEW.id::text || '/edit'
      );
    END IF;
  END IF;

  IF NEW.status = 'published' AND OLD.status = 'pending_review'
     AND NEW.author_id IS NOT NULL
     AND public.is_notification_enabled(NEW.author_id, 'published') THEN
    SELECT handle INTO v_author_handle FROM public.profiles WHERE id = NEW.author_id;
    v_url := COALESCE(public.card_public_url(NEW.id), '/admin/cards/' || NEW.id::text || '/edit');
    INSERT INTO public.notifications
      (recipient_id, kind, card_id, message, url)
    VALUES (
      NEW.author_id, 'published', NEW.id,
      '카드가 발행되었습니다', v_url
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ── on_card_like_for_notification ──
CREATE OR REPLACE FUNCTION public.on_card_like_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card_author uuid;
  v_card_short text;
  v_actor_profile uuid;
  v_actor_name text;
  v_existing_id bigint;
  v_total_likers int;
  v_message text;
BEGIN
  SELECT c.author_id, c.shortcode INTO v_card_author, v_card_short
    FROM public.cards c WHERE c.id = NEW.card_id;
  IF v_card_author IS NULL THEN RETURN NEW; END IF;

  -- ADR 0014 Phase 3 (0187): card_likes.user_id → profile_id. NEW.profile_id 사용.
  v_actor_profile := public.auth_uid_to_profile_id(NEW.profile_id);
  IF v_actor_profile = v_card_author THEN RETURN NEW; END IF;
  IF NOT public.is_notification_enabled(v_card_author, 'like') THEN RETURN NEW; END IF;

  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  -- 24h 내 같은 카드 좋아요 누른 고유 사용자 수 (이번 NEW 포함)
  -- ADR 0014 Phase 3: card_likes.user_id → profile_id.
  SELECT count(DISTINCT profile_id) INTO v_total_likers
    FROM public.card_likes
   WHERE card_id = NEW.card_id
     AND created_at >= now() - interval '24 hours';

  IF v_total_likers <= 1 THEN
    v_message := v_actor_name || '님이 좋아합니다';
  ELSE
    v_message := v_actor_name || '님 외 ' || (v_total_likers - 1)::text || '명이 좋아합니다';
  END IF;

  -- 24h 내 기존 알림 있으면 UPDATE, 없으면 INSERT
  SELECT id INTO v_existing_id
    FROM public.notifications
   WHERE recipient_id = v_card_author
     AND card_id = NEW.card_id
     AND kind = 'like'
     AND created_at >= now() - interval '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.notifications
       SET message = v_message,
           actor_id = v_actor_profile,
           created_at = now(),
           read_at = NULL
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.notifications
      (recipient_id, kind, actor_id, card_id, message, url)
    VALUES (
      v_card_author,
      'like',
      v_actor_profile,
      NEW.card_id,
      v_message,
      COALESCE(public.card_public_url(NEW.card_id), '/')
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ── on_comment_for_notification ──
CREATE OR REPLACE FUNCTION public.on_comment_for_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_qa_author uuid;
  v_qa_short text;
  v_author_handle text;
  v_actor_profile uuid;
  v_parent_author uuid;
  v_actor_name text;
  v_url text;
BEGIN
  IF NEW.status <> 'visible' THEN RETURN NEW; END IF;

  SELECT c.author_id, c.shortcode, p.handle
    INTO v_qa_author, v_qa_short, v_author_handle
    FROM public.cards c
    LEFT JOIN public.profiles p ON p.id = c.author_id
   WHERE c.id = NEW.card_id;

  v_actor_profile := public.auth_uid_to_profile_id(NEW.author_id);
  SELECT COALESCE(display_name, handle, '회원') INTO v_actor_name
    FROM public.profiles WHERE id = v_actor_profile;

  -- 공개 URL = /{handle}/{shortcode}#c{comment_id}. handle/shortcode 없으면 admin edit 으로
  v_url := COALESCE(public.card_public_url(NEW.card_id) || '#c' || NEW.id::text, '/admin/cards/' || NEW.card_id::text || '/edit#c' || NEW.id::text);

  IF NEW.parent_id IS NULL THEN
    IF v_qa_author IS NOT NULL AND v_qa_author <> v_actor_profile
       AND public.is_notification_enabled(v_qa_author, 'comment') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, card_id, comment_id, message, url)
      VALUES (
        v_qa_author, 'comment', v_actor_profile, NEW.card_id, NEW.id,
        v_actor_name || '님이 댓글을 남겼습니다',
        v_url
      );
    END IF;
  ELSE
    SELECT public.auth_uid_to_profile_id(c.author_id) INTO v_parent_author
      FROM public.comments c WHERE c.id = NEW.parent_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> v_actor_profile
       AND public.is_notification_enabled(v_parent_author, 'reply') THEN
      INSERT INTO public.notifications
        (recipient_id, kind, actor_id, card_id, comment_id, message, url)
      VALUES (
        v_parent_author, 'reply', v_actor_profile, NEW.card_id, NEW.id,
        v_actor_name || '님이 답글을 남겼습니다',
        v_url
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- (3) 테이블 코멘트 복원 + 알림 데이터 백필
-- ── 테이블/뷰 코멘트 한국어 복원 (DB 내부 문서) ──
COMMENT ON TABLE public.cards IS 'Q&A + 일반 글 통합 테이블 (ADR 0004). title/body 컬럼 (P2-4, 0171). 0173 schema cache reload trigger.';
COMMENT ON VIEW public.doctor_accounts IS '0176 (2026-05-28) 호환성 view — 외부 스크립트·backup pipeline SELECT 호환용. SSOT 는 profiles.doctor_id. INSERT/UPDATE/DELETE 는 view 라 실패 (의도). 신규 매핑은 link_doctor_to_profile RPC 사용.';
COMMENT ON TABLE public.doctor_accounts_deprecated IS '0176 (2026-05-28) 폐기 — SSOT 는 profiles.doctor_id. 매핑 시점 created_at 만 audit 용 보존. 신규 매핑 INSERT 금지 (link_doctor_to_profile RPC 사용).';

-- ── 깨진 알림 메시지 15행 백필 ──
UPDATE public.notifications SET message = '카드가 발행되었습니다'
  WHERE kind = 'published' AND position(chr(65533) in message) > 0;
UPDATE public.notifications SET message = '회원님 글을 ' || substring(message from '[0-9]+') || '명이 저장했어요'
  WHERE kind = 'save' AND position(chr(65533) in message) > 0 AND message ~ '[0-9]';

-- ── 알림 URL canonical 재계산 (의사글만, #c 앵커 보존, 멱등) ──
UPDATE public.notifications n
   SET url = public.card_public_url(card_id) || COALESCE('#c' || comment_id::text, '')
 WHERE card_id IS NOT NULL
   AND public.card_public_url(card_id) LIKE '/doctors/%'
   AND url IS DISTINCT FROM public.card_public_url(card_id) || COALESCE('#c' || comment_id::text, '');

COMMIT;
SELECT 'OK 0298' AS status;
