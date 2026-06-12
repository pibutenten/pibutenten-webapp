-- 0280_top_cards_public_sitewide.sql
-- get_top_cards_by_{views,likes,saves,shares,comments} 의 '사이트 전체(both NULL)' 게이트 완화.
--   기존: 사이트 전체 통계는 is_admin() 만 호출 가능(관리자 대시보드 전용).
--   변경: 발행 카드의 조회수·좋아요·저장·공유·댓글 수는 이미 피드에 공개되는 정보 →
--          사이트 전체 인기/통계 읽기를 로그인 회원 누구나 가능하게(범용 재사용, 예: 내 일기 '인기글').
--   유지: 특정 원장(p_doctor_id)·작성자(p_author_profile_id) 단위 필터 경로는
--          기존 _check_doctor_kpi_access 권한 체크 그대로(타인 KPI 보호).
--   집계 로직(get_top_cards_by_*_inner)·시그니처·GRANT(authenticated)·anon REVOKE 모두 불변.

BEGIN;

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

CREATE OR REPLACE FUNCTION public.get_top_cards_by_shares(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL, p_author_profile_id uuid DEFAULT NULL)
RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (p_doctor_id IS NULL AND p_author_profile_id IS NULL) THEN
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_shares_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_likes(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL, p_author_profile_id uuid DEFAULT NULL)
RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (p_doctor_id IS NULL AND p_author_profile_id IS NULL) THEN
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_likes_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_saves(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL, p_author_profile_id uuid DEFAULT NULL)
RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (p_doctor_id IS NULL AND p_author_profile_id IS NULL) THEN
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_saves_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_cards_by_comments(
  p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_doctor_id uuid DEFAULT NULL, p_author_profile_id uuid DEFAULT NULL)
RETURNS TABLE(card_id bigint, title text, shortcode text, author_id uuid,
              author_name text, author_handle text, cnt bigint, deleted_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (p_doctor_id IS NULL AND p_author_profile_id IS NULL) THEN
    IF NOT public._check_doctor_kpi_access(p_doctor_id) THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.get_top_cards_by_comments_inner(
    p_days, p_limit, p_offset, p_doctor_id, p_author_profile_id);
END;
$$;

COMMIT;
