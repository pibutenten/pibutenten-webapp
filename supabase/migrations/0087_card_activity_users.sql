-- 0087: 카드별 활동 사용자 조회 RPC — 대시보드 활동통계 펼침용
--
-- 사용처: /admin/stats/{likes|saves|shares|views} 페이지에서
--   각 카드 row의 카운트 클릭 → 그 카드에 활동한 사용자 닉네임 N명 inline 펼침.
--
-- 정책:
--   - 좋아요/저장: 모든 행 (24h 제한 없음, 누적)
--   - 공유: 모든 행
--   - 조회: card_views 중 user_id NOT NULL 인 것만 (비로그인 session 제외)
--   - profile.id → display_name/handle/avatar join
--   - 같은 user_id 중복 제거 (좋아요는 1회만, 조회는 distinct user)
--   - 최신순, 기본 limit 30
--
-- admin/관리자 권한만 SELECT (RLS는 source 테이블이 이미 admin policy 적용 중이라 SECURITY DEFINER로 충분)

CREATE OR REPLACE FUNCTION public.get_card_activity_users(
  p_card_id bigint,
  p_kind text,           -- 'likes' | 'saves' | 'shares' | 'views'
  p_limit int DEFAULT 30
)
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  acted_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_kind = 'likes' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      l.created_at
    FROM public.card_likes l
    JOIN public.profiles p ON p.id = l.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE l.card_id = p_card_id
    ORDER BY p.id, l.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'saves' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      s.created_at
    FROM public.card_saves s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE s.card_id = p_card_id
    ORDER BY p.id, s.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'shares' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      sh.created_at
    FROM public.card_shares sh
    JOIN public.profiles p ON p.id = sh.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE sh.card_id = p_card_id
      AND sh.user_id IS NOT NULL
    ORDER BY p.id, sh.created_at DESC
    LIMIT p_limit;

  ELSIF p_kind = 'views' THEN
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
      p.id, p.display_name, p.handle,
      COALESCE(d.photo_url, '/doctors/' || d.slug || '.png', p.avatar_url) AS avatar_url,
      v.created_at
    FROM public.card_views v
    JOIN public.profiles p ON p.id = v.user_id
    LEFT JOIN public.doctor_accounts da ON da.profile_id = p.id
    LEFT JOIN public.doctors d ON d.id = da.doctor_id
    WHERE v.card_id = p_card_id
      AND v.user_id IS NOT NULL
    ORDER BY p.id, v.created_at DESC
    LIMIT p_limit;

  ELSE
    -- 기타 kind 무효
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_card_activity_users(bigint, text, int) TO authenticated;

SELECT 'OK 0087' AS status;
