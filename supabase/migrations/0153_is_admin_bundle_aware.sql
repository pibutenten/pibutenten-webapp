-- 0153: is_admin() 묶음 인식 확장 (2026-05-22)
--
-- 배경:
--   숨김(hidden) 처리한 글/댓글이 관리자에게도 안 보이는 회귀 발견.
--   cards_public_read / comments_select RLS 가 is_admin() OR (작성자 묶음) 으로 인정하는데,
--   현 is_admin() 정의는 base auth.uid 의 profile.role 만 보고 묶음을 인식하지 않음.
--
--   active identity 패턴 (Phase 9 묶음) 에서는 base auth user 가 admin profile 이
--   아니어도 묶음 안에 admin profile 이 있을 수 있음. 그 경우 본인은 super admin
--   권한을 행사하지만 RLS 가 is_admin() = false 로 판정 → hidden 콘텐츠 차단.
--
-- 해결:
--   is_admin(uid) 가 same_group_profile_ids(uid) 안의 어느 profile 이라도
--   role='admin' 이면 true 반환. 묶음 인식과 일관.
--
-- 영향:
--   - cards_public_read: hidden / draft / pending_review 카드도 admin 묶음에게 노출
--   - comments_select / comments_admin_all: hidden 댓글 admin 묶음에게 노출
--   - 기타 is_admin() 호출 RLS 일관 적용
--
-- 안전성:
--   묶음(bundle) 자체가 본인 권한 통합 단위 (Phase 9). 같은 묶음 안에 admin profile
--   이 있다는 것은 본인이 admin 사용자임을 인정하는 것이므로 권한 확장이 자연스러움.

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.role = 'admin'
      and (
        p.id = uid
        or p.auth_user_id = uid
        or p.id IN (SELECT same_group_profile_ids(uid))
      )
  );
$function$;

-- 검증: 묶음에 admin profile 있는 임의 사용자 1명 확인 (없으면 skip)
SELECT
  count(*) AS admin_profiles_count,
  (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role='admin') AS direct_admin_count
FROM public.profiles
WHERE role = 'admin';
