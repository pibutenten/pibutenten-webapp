-- 0174_fix_top_cards_wrappers_question_legacy.sql
--
-- 2026-05-28 — 0171 이 누락한 wrapper 6개의 RETURNS TABLE 잔재 fix.
--
-- ── 발견된 사실 (pg_get_function_result 팩트 체크) ────────────────────────────
-- 0171 마이그레이션은 cards.question/answer → title/body 리네임 시:
--   - cards 테이블 컬럼 RENAME ✓
--   - 인덱스 RENAME ✓
--   - _inner 함수 (get_top_cards_by_{views,likes,comments,saves,shares}_inner,
--     get_top_new_cards_inner) 재정의 ✓
--   - feed/search/tag_cards_scored 재정의 ✓
--   - get_notifications card_title alias 갱신 ✓
--
-- 그러나 **inner 함수를 감싸는 외부 wrapper 6개를 재정의하지 않음**:
--   - get_top_cards_by_comments
--   - get_top_cards_by_likes
--   - get_top_cards_by_saves
--   - get_top_cards_by_shares
--   - get_top_cards_by_views
--   - get_top_new_cards
--
-- 각 wrapper 는 `RETURNS TABLE(card_id bigint, question text, shortcode text, ...)`
-- 시그니처를 그대로 유지한 채 본문에서 `RETURN QUERY SELECT * FROM ..._inner(...)` 호출.
-- inner 가 `(card_id, title, shortcode, ...)` 컬럼명으로 반환해도 PostgreSQL 은
-- 위치 기반 매칭으로 wrapper 의 `question` 슬롯에 title 값을 넣어 흘려보낸다.
-- → PostgREST 는 wrapper 시그니처의 컬럼명 (`question`) 으로 JSON 응답
-- → 클라이언트 (StatsListClient 등) 는 `row.title` 접근 → undefined
-- → UI 에 "(제목 없음)" 표시 (사용자 보고된 정확한 증상).
--
-- ── 본 마이그레이션 행동 ──────────────────────────────────────────────────────
-- 6개 wrapper 를 DROP + CREATE OR REPLACE 로 재정의.
--   - 시그니처: `question text` → `title text` (단 한 가지 변경)
--   - 본문: 변경 없음 (RETURN QUERY SELECT * FROM ..._inner(...))
--   - 권한: 기존과 동일 (authenticated EXECUTE) — DROP 후 재부여
--   - 가드 분기 (is_admin / _check_doctor_kpi_access) 그대로 유지
--
-- ── 회귀 위협 ─────────────────────────────────────────────────────────────────
-- 데이터 변경 0, 본문 로직 변경 0. 시그니처 column 이름만 변경.
-- 호출 클라이언트 측 영향:
--   - StatsListClient.tsx 의 CardRow.title 접근 → undefined → 정상 string 으로 fix.
--   - row.question 을 직접 접근하는 코드가 있다면 깨질 수 있음. grep 결과 0건 (안전).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── (A) get_top_cards_by_comments ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text, cnt bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_comments_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_comments(integer, integer, integer, uuid, uuid) TO authenticated;

-- ── (B) get_top_cards_by_likes ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text, cnt bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_likes_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_likes(integer, integer, integer, uuid, uuid) TO authenticated;

-- ── (C) get_top_cards_by_saves ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text, cnt bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_saves_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_saves(integer, integer, integer, uuid, uuid) TO authenticated;

-- ── (D) get_top_cards_by_shares ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text, cnt bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_shares_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_shares(integer, integer, integer, uuid, uuid) TO authenticated;

-- ── (E) get_top_cards_by_views ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_cards_by_views(integer, integer, integer, uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_top_cards_by_views(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL::uuid,
  p_author_profile_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text, cnt bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_doctor_id IS NULL AND p_author_profile_id IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_views_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_cards_by_views(integer, integer, integer, uuid, uuid) TO authenticated;

-- ── (F) get_top_new_cards ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_new_cards(integer, integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_new_cards(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  card_id bigint, title text, shortcode text,
  author_id uuid, author_name text, author_handle text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_new_cards_inner(p_days, p_limit, p_offset);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_top_new_cards(integer, integer, integer) TO authenticated;

COMMIT;

-- PostgREST 스키마 캐시 양방향 강제 reload (요청 시 필수 포함).
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
